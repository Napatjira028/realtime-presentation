"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2, Play, PlusCircle, Radio, Save, Trash2 } from "lucide-react"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { generateRoomCode } from "@/lib/room"
import type { Participant, Session } from "@/lib/types"
import { ConfigNotice } from "@/components/config-notice"
import { ParticipantList } from "@/components/teacher/participant-list"
import { PdfStage } from "@/components/presentation/pdf-stage"

type QuestionRow = {
  id: number
  presentation_id: number
  slide_number: number
  question: string
  choice_a: string
  choice_b: string
  choice_c: string | null
  choice_d: string | null
  correct_answer: string
  points: number
}

type AnswerRow = {
  id: number
  participant_id: number
  question_id: number
  answer: string
  is_correct: boolean
  score: number
  response_time: number | null
  created_at?: string
}

const MAX_CODE_ATTEMPTS = 5

export function TeacherDashboard() {
  const [title, setTitle] = useState("")
  const [session, setSession] = useState<Session | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [creating, setCreating] = useState(false)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(1)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [currentQuestion, setCurrentQuestion] = useState<QuestionRow | null>(null)
  const [questionText, setQuestionText] = useState("")
  const [choiceA, setChoiceA] = useState("")
  const [choiceB, setChoiceB] = useState("")
  const [choiceC, setChoiceC] = useState("")
  const [choiceD, setChoiceD] = useState("")
  const [correctAnswer, setCorrectAnswer] = useState<"A" | "B" | "C" | "D">("A")
  const [questionPoints, setQuestionPoints] = useState(1)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [questionAnswers, setQuestionAnswers] = useState<AnswerRow[]>([])

  const configured = isSupabaseConfigured

  const createRoom = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const supabase = getSupabaseClient()
      if (!supabase) return
      const trimmed = title.trim()
      if (!trimmed) {
        setError("Please enter a presentation title.")
        return
      }

      setCreating(true)
      setError(null)
      try {
        // 1. Create the presentation.
        const { data: presentation, error: pErr } = await supabase
          .from("presentations")
          .insert({ title: trimmed })
          .select()
          .single()
        if (pErr) throw pErr

        // 2. Create a session with a unique 6-digit code (retry on collision).
        let created: Session | null = null
        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !created; attempt++) {
          const code = generateRoomCode()
          const { data, error: sErr } = await supabase
            .from("sessions")
            .insert({
              presentation_id: presentation.id,
              room_code: code,
              status: "waiting",
              current_slide: 1,
            })
            .select()
            .single()

          if (!sErr) {
            created = data as Session
            break
          }
          // 23505 = unique_violation -> try another code
          if ((sErr as { code?: string }).code !== "23505") throw sErr
        }

        if (!created) throw new Error("Could not generate a unique room code. Please try again.")
        setSession(created)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create room.")
      } finally {
        setCreating(false)
      }
    },
    [title],
  )

  // Load + subscribe to participants for the active session.
  const sessionId = session?.id
  const fetchParticipants = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !sessionId) return
    const { data } = await supabase
      .from("participants")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
    if (data) setParticipants(data as Participant[])
  }, [sessionId])

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase || !sessionId) return

    fetchParticipants()

    const channel = supabase
      .channel(`participants:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` },
        () => fetchParticipants(),
      )
      .subscribe()

    // Polling fallback in case realtime replication is not enabled on the table.
    pollRef.current = setInterval(fetchParticipants, 5000)

    return () => {
      supabase.removeChannel(channel)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [sessionId, fetchParticipants])

  const changeSlide = useCallback(
    async (nextSlide: number) => {
      const supabase = getSupabaseClient()
      if (!supabase || !session) return

      const targetSlide = Math.max(1, Math.min(nextSlide, numPages))

      const { data, error } = await supabase
        .from("sessions")
        .update({ current_slide: targetSlide })
        .eq("id", session.id)
        .select()
        .single()

      if (error) {
        setError(error.message)
        return
      }

      setSession(data as Session)
    },
    [session, numPages],
  )

  const copyCode = useCallback(async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.room_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable; ignore silently.
    }
  }, [session])
const uploadPdf = useCallback(async (file: File) => {
  const supabase = getSupabaseClient()
  if (!supabase || !session) return

  setUploadingPdf(true)
  setError(null)

  try {
    const filePath = `${session.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from("presentations")
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data } = supabase.storage
      .from("presentations")
      .getPublicUrl(filePath)

    const publicUrl = data.publicUrl

    const { error: updateError } = await supabase
      .from("presentations")
      .update({ file_url: publicUrl })
      .eq("id", session.presentation_id)

    if (updateError) throw updateError

    setPdfFile(file)
    setPdfUrl(publicUrl)
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Failed to upload PDF."
    )
  } finally {
    setUploadingPdf(false)
  }
}, [session])
  const startPresentation = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session) return
    setStarting(true)
    setError(null)
    try {
      const { data, error: uErr } = await supabase
        .from("sessions")
        .update({ status: "active" })
        .eq("id", session.id)
        .select()
        .single()
      if (uErr) throw uErr
      setSession(data as Session)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start presentation.")
    } finally {
      setStarting(false)
    }
  }, [session])


  const refreshCurrentQuestion = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session?.presentation_id || !session?.current_slide) return

    const { data, error: qErr } = await supabase
      .from("questions")
      .select("*")
      .eq("presentation_id", session.presentation_id)
      .eq("slide_number", session.current_slide)
      .maybeSingle()

    if (qErr) {
      console.error("Failed to load question:", qErr)
      return
    }

    setCurrentQuestion((data as QuestionRow | null) ?? null)
  }, [session?.presentation_id, session?.current_slide])

  const refreshQuestionAnswers = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !currentQuestion?.id) {
      setQuestionAnswers([])
      return
    }

    const { data, error: aErr } = await supabase
      .from("answers")
      .select("*")
      .eq("question_id", currentQuestion.id)
      .order("created_at", { ascending: true })

    if (aErr) {
      console.error("Failed to load answers:", aErr)
      return
    }

    setQuestionAnswers((data as AnswerRow[]) ?? [])
  }, [currentQuestion?.id])

  useEffect(() => {
    if (!session?.presentation_id) return

    refreshCurrentQuestion()

    const supabase = getSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel(`teacher-questions:${session.presentation_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "questions",
          filter: `presentation_id=eq.${session.presentation_id}`,
        },
        () => refreshCurrentQuestion(),
      )
      .subscribe()

    const timer = setInterval(refreshCurrentQuestion, 3000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
    }
  }, [session?.presentation_id, refreshCurrentQuestion])

  useEffect(() => {
    if (!currentQuestion?.id) {
      setQuestionAnswers([])
      return
    }

    refreshQuestionAnswers()

    const supabase = getSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel(`teacher-answers:${currentQuestion.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "answers",
          filter: `question_id=eq.${currentQuestion.id}`,
        },
        () => refreshQuestionAnswers(),
      )
      .subscribe()

    const timer = setInterval(refreshQuestionAnswers, 2500)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
    }
  }, [currentQuestion?.id, refreshQuestionAnswers])

  useEffect(() => {
    if (currentQuestion) {
      setQuestionText(currentQuestion.question ?? "")
      setChoiceA(currentQuestion.choice_a ?? "")
      setChoiceB(currentQuestion.choice_b ?? "")
      setChoiceC(currentQuestion.choice_c ?? "")
      setChoiceD(currentQuestion.choice_d ?? "")
      const normalized = (currentQuestion.correct_answer ?? "A").trim().toUpperCase()
      setCorrectAnswer(
        normalized === "B" || normalized === "C" || normalized === "D" ? normalized : "A",
      )
      setQuestionPoints(currentQuestion.points ?? 1)
    } else {
      setQuestionText("")
      setChoiceA("")
      setChoiceB("")
      setChoiceC("")
      setChoiceD("")
      setCorrectAnswer("A")
      setQuestionPoints(1)
    }
  }, [currentQuestion?.id, session?.current_slide])

  const saveQuestion = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session) return

    if (!questionText.trim() || !choiceA.trim() || !choiceB.trim()) {
      setError("Question, choice A and choice B are required.")
      return
    }

    setSavingQuestion(true)
    setError(null)

    try {
      const payload = {
        presentation_id: session.presentation_id,
        slide_number: session.current_slide ?? 1,
        question: questionText.trim(),
        choice_a: choiceA.trim(),
        choice_b: choiceB.trim(),
        choice_c: choiceC.trim() || null,
        choice_d: choiceD.trim() || null,
        correct_answer: correctAnswer,
        points: Math.max(1, Number(questionPoints) || 1),
      }

      if (currentQuestion) {
        const { data, error: updateErr } = await supabase
          .from("questions")
          .update(payload)
          .eq("id", currentQuestion.id)
          .select()
          .single()

        if (updateErr) throw updateErr
        setCurrentQuestion(data as QuestionRow)
      } else {
        const { data, error: insertErr } = await supabase
          .from("questions")
          .insert(payload)
          .select()
          .single()

        if (insertErr) throw insertErr
        setCurrentQuestion(data as QuestionRow)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save question.")
    } finally {
      setSavingQuestion(false)
    }
  }, [
    session,
    currentQuestion,
    questionText,
    choiceA,
    choiceB,
    choiceC,
    choiceD,
    correctAnswer,
    questionPoints,
  ])

  const deleteQuestion = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !currentQuestion) return

    const { error: deleteErr } = await supabase
      .from("questions")
      .delete()
      .eq("id", currentQuestion.id)

    if (deleteErr) {
      setError(deleteErr.message)
      return
    }

    setCurrentQuestion(null)
    setQuestionAnswers([])
  }, [currentQuestion])

  if (!configured) {
    return <ConfigNotice />
  }

  // ---- Create-room view -------------------------------------------------
  if (!session) {
    return (
      <form onSubmit={createRoom} className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Create a presentation room</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Give your presentation a title. We&apos;ll generate a room code students can use to join.
        </p>

        <label htmlFor="title" className="mt-6 block text-sm font-medium">
          Presentation title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Introduction to Photosynthesis"
          className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          autoComplete="off"
        />

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={creating}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PlusCircle className="size-4" aria-hidden="true" />
          )}
          {creating ? "Creating room…" : "Create room"}
        </button>
      </form>
    )
  }

  // ---- Active-room view -------------------------------------------------
  const isActive = session.status === "active"

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-2">
      {/* Room code card */}
      <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="code-heading">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isActive ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
            }`}
          >
            <Radio className="size-3.5" aria-hidden="true" />
            {isActive ? "Live" : "Waiting room"}
          </span>
        </div>

        <h2 id="code-heading" className="mt-4 text-sm font-medium text-muted-foreground">
          Room code
        </h2>
        <div className="mt-2 flex items-center gap-3">
          <p className="font-mono text-4xl font-bold tracking-[0.2em] tabular-nums">{session.room_code}</p>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/40"
            aria-label="Copy room code"
          >
            {copied ? (
              <Check className="size-3.5 text-primary" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground text-pretty">
          Share this code with your students. They can join from the Student page.
        </p>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
<div className="mt-4 space-y-2">
  <label className="block text-sm font-medium">
    Presentation PDF
  </label>

  <input
    type="file"
    accept="application/pdf"
    disabled={uploadingPdf}
    onChange={(event) => {
      const file = event.target.files?.[0]
      if (!file) return

      setPdfFile(file)
      uploadPdf(file)
    }}
    className="block w-full text-sm"
  />

  {uploadingPdf && (
    <p className="text-sm text-muted-foreground">
      Uploading PDF...
    </p>
  )}

  {pdfFile && !uploadingPdf && (
    <p className="text-sm text-muted-foreground">
      Selected: {pdfFile.name}
    </p>
  )}
</div>
        <button
          type="button"
          onClick={startPresentation}
          disabled={starting || isActive}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {starting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
          {isActive ? "Presentation started" : starting ? "Starting…" : "Start presentation"}
        </button>
        {pdfUrl && (
  <div className="mt-6">
    <PdfStage
      fileUrl={pdfUrl}
      pageNumber={session.current_slide ?? 1}
      onNumPages={setNumPages}
      emptyState={
        <div className="text-sm text-muted-foreground">
          No PDF loaded.
        </div>
      }
    />

    <div className="mt-4 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => changeSlide((session.current_slide ?? 1) - 1)}
        disabled={(session.current_slide ?? 1) <= 1}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Previous
      </button>

      <span className="text-sm font-medium text-muted-foreground">
        Slide {session.current_slide ?? 1} / {numPages}
      </span>

      <button
        type="button"
        onClick={() => changeSlide((session.current_slide ?? 1) + 1)}
        disabled={(session.current_slide ?? 1) >= numPages}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next →
      </button>
    </div>

    <section className="mt-6 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Question · Slide {session.current_slide ?? 1}
          </p>
          <h3 className="mt-1 text-base font-semibold">
            {currentQuestion ? "Edit question for this slide" : "Create a question for this slide"}
          </h3>
        </div>
        {currentQuestion && (
          <button
            type="button"
            onClick={deleteQuestion}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </button>
        )}
      </div>

      <label className="mt-4 block text-sm font-medium">Question</label>
      <textarea
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        rows={3}
        placeholder="Type the question students should answer..."
        className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["A", choiceA, setChoiceA],
          ["B", choiceB, setChoiceB],
          ["C", choiceC, setChoiceC],
          ["D", choiceD, setChoiceD],
        ].map(([key, value, setter]) => (
          <label key={key as string} className="block text-sm font-medium">
            Choice {key as string}
            <input
              value={value as string}
              onChange={(event) => (setter as (value: string) => void)(event.target.value)}
              placeholder={`Choice ${key as string}`}
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Correct answer
          <select
            value={correctAnswer}
            onChange={(event) => setCorrectAnswer(event.target.value as "A" | "B" | "C" | "D")}
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C" disabled={!choiceC.trim()}>C</option>
            <option value="D" disabled={!choiceD.trim()}>D</option>
          </select>
        </label>

        <label className="block text-sm font-medium">
          Points
          <input
            type="number"
            min={1}
            value={questionPoints}
            onChange={(event) => setQuestionPoints(Math.max(1, Number(event.target.value) || 1))}
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={saveQuestion}
        disabled={savingQuestion}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {savingQuestion ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="size-4" aria-hidden="true" />
        )}
        {savingQuestion ? "Saving..." : currentQuestion ? "Update question" : "Save question"}
      </button>

      {currentQuestion && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Responses</h4>
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
              {questionAnswers.length} / {participants.length}
            </span>
          </div>

          {questionAnswers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Waiting for student answers...</p>
          ) : (
            <div className="mt-3 space-y-2">
              {questionAnswers.map((answer) => {
                const student = participants.find((item) => item.id === answer.participant_id)
                return (
                  <div
                    key={answer.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{student?.name ?? `Student #${answer.participant_id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        Answer {answer.answer}
                        {answer.response_time != null ? ` · ${answer.response_time}s` : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        answer.is_correct
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-900"
                      }`}
                    >
                      {answer.is_correct ? `+${answer.score}` : "0"}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  </div>
)}
      </section>

      {/* Participants */}
      <ParticipantList participants={participants} />
    </div>
  )
}