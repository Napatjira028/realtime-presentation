"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2, Play, PlusCircle, Radio, Save, Square, Trophy, Trash2, Eye } from "lucide-react"
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
  time_limit: number | null
  speed_bonus: number | null
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

type FinalLeaderboardRow = {
  participantId: number
  name: string
  studentNumber: string | null
  score: number
  correctAnswers: number
  answeredQuestions: number
  rank: number
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
  const [timeLimit, setTimeLimit] = useState(15)
  const [speedBonus, setSpeedBonus] = useState(5)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [questionAnswers, setQuestionAnswers] = useState<AnswerRow[]>([])
  const [ending, setEnding] = useState(false)
  const [revealingResults, setRevealingResults] = useState(false)
  const [finalLeaderboard, setFinalLeaderboard] = useState<FinalLeaderboardRow[]>([])

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
              reveal_results: false,
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

  const refreshFinalLeaderboard = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session?.id) {
      setFinalLeaderboard([])
      return
    }

    const { data: sessionParticipants, error: participantsErr } = await supabase
      .from("participants")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })

    if (participantsErr) {
      console.error("Failed to load final leaderboard participants:", participantsErr)
      return
    }

    const currentParticipants = (sessionParticipants as Participant[]) ?? []
    if (currentParticipants.length === 0) {
      setFinalLeaderboard([])
      return
    }

    const participantIds = currentParticipants.map((item) => item.id)

    const { data: allAnswers, error: answersErr } = await supabase
      .from("answers")
      .select("participant_id, score, is_correct")
      .in("participant_id", participantIds)

    if (answersErr) {
      console.error("Failed to load final leaderboard answers:", answersErr)
      return
    }

    const totals = new Map<
      number,
      { score: number; correctAnswers: number; answeredQuestions: number }
    >()

    for (const participantItem of currentParticipants) {
      totals.set(participantItem.id, {
        score: 0,
        correctAnswers: 0,
        answeredQuestions: 0,
      })
    }

    for (const answer of (allAnswers ?? []) as Array<{
      participant_id: number
      score: number | null
      is_correct: boolean | null
    }>) {
      const current = totals.get(answer.participant_id)
      if (!current) continue

      current.score += Number(answer.score ?? 0)
      current.answeredQuestions += 1
      if (answer.is_correct) current.correctAnswers += 1
    }

    const sorted = currentParticipants
      .map((participantItem) => {
        const total = totals.get(participantItem.id) ?? {
          score: 0,
          correctAnswers: 0,
          answeredQuestions: 0,
        }

        return {
          participantId: participantItem.id,
          name: participantItem.name,
          studentNumber: participantItem.student_number ?? null,
          score: total.score,
          correctAnswers: total.correctAnswers,
          answeredQuestions: total.answeredQuestions,
          rank: 0,
        }
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers
        return a.name.localeCompare(b.name, "th")
      })
      .map((row, index, rows) => {
        const previous = rows[index - 1]
        const sameAsPrevious =
          previous &&
          previous.score === row.score &&
          previous.correctAnswers === row.correctAnswers

        return {
          ...row,
          rank: sameAsPrevious ? previous.rank : index + 1,
        }
      })

    setFinalLeaderboard(sorted)
  }, [session?.id])

  useEffect(() => {
    if (!session?.id) return

    refreshFinalLeaderboard()

    const supabase = getSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel(`teacher-final-leaderboard:${session.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers" },
        () => refreshFinalLeaderboard(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${session.id}` },
        () => refreshFinalLeaderboard(),
      )
      .subscribe()

    const timer = window.setInterval(refreshFinalLeaderboard, 2500)

    return () => {
      supabase.removeChannel(channel)
      window.clearInterval(timer)
    }
  }, [session?.id, refreshFinalLeaderboard])

  const endPresentation = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session || session.status !== "active") return

    const confirmed = window.confirm(
      "End this presentation? Students will no longer be able to answer questions.",
    )
    if (!confirmed) return

    setEnding(true)
    setError(null)

    try {
      const { data, error: endErr } = await supabase
        .from("sessions")
        .update({ status: "ended", reveal_results: false })
        .eq("id", session.id)
        .select()
        .single()

      if (endErr) throw endErr

      setSession(data as Session)
      await refreshFinalLeaderboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end presentation.")
    } finally {
      setEnding(false)
    }
  }, [session, refreshFinalLeaderboard])

  const revealResultsToStudents = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session || session.status !== "ended") return

    setRevealingResults(true)
    setError(null)

    try {
      const { data, error: revealErr } = await supabase
        .from("sessions")
        .update({ reveal_results: true })
        .eq("id", session.id)
        .select()
        .single()

      if (revealErr) throw revealErr
      setSession(data as Session)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal results.")
    } finally {
      setRevealingResults(false)
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
      setTimeLimit(currentQuestion.time_limit ?? 15)
      setSpeedBonus(currentQuestion.speed_bonus ?? 5)
    } else {
      setQuestionText("")
      setChoiceA("")
      setChoiceB("")
      setChoiceC("")
      setChoiceD("")
      setCorrectAnswer("A")
      setQuestionPoints(1)
      setTimeLimit(15)
      setSpeedBonus(5)
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
        time_limit: Math.max(5, Number(timeLimit) || 15),
        speed_bonus: Math.max(0, Number(speedBonus) || 0),
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
    timeLimit,
    speedBonus,
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
  const isEnded = session.status === "ended"

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

        {isActive && (
          <button
            type="button"
            onClick={endPresentation}
            disabled={ending}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
          >
            {ending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Square className="size-4" aria-hidden="true" />
            )}
            {ending ? "Ending..." : "End presentation"}
          </button>
        )}

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
          Base points
          <input
            type="number"
            min={1}
            value={questionPoints}
            onChange={(event) => setQuestionPoints(Math.max(1, Number(event.target.value) || 1))}
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm font-medium">
          Time limit (seconds)
          <input
            type="number"
            min={5}
            max={300}
            value={timeLimit}
            onChange={(event) => setTimeLimit(Math.max(5, Number(event.target.value) || 15))}
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Default: 15 seconds
          </span>
        </label>

        <label className="block text-sm font-medium">
          Speed bonus
          <input
            type="number"
            min={0}
            value={speedBonus}
            onChange={(event) => setSpeedBonus(Math.max(0, Number(event.target.value) || 0))}
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Maximum extra points for a fast correct answer
          </span>
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        ⏱ {timeLimit}s per question · ⚡ Up to +{speedBonus} speed bonus · 🎯 {questionPoints} base point{questionPoints === 1 ? "" : "s"}
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

      {/* Participants / final results */}
      {isEnded ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Trophy className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Final leaderboard</h2>
                <p className="text-xs text-muted-foreground">
                  Students cannot see their ranking until you reveal the results.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
              {finalLeaderboard.length}
            </span>
          </div>

          <div className="mt-4">
            {session.reveal_results ? (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Results are visible to students.
              </div>
            ) : (
              <button
                type="button"
                onClick={revealResultsToStudents}
                disabled={revealingResults || finalLeaderboard.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {revealingResults ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
                {revealingResults ? "Revealing..." : "Reveal results to students"}
              </button>
            )}
          </div>

          {finalLeaderboard.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No student scores yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {finalLeaderboard.map((row) => {
                const medal =
                  row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null

                return (
                  <div
                    key={row.participantId}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${
                      row.rank <= 3
                        ? "border-primary/20 bg-primary/5"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                        {medal ?? row.rank}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.studentNumber ? `#${row.studentNumber} · ` : ""}
                          {row.correctAnswers} correct · {row.answeredQuestions} answered
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold tabular-nums text-primary">{row.score}</p>
                      <p className="text-[11px] text-muted-foreground">points</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <ParticipantList participants={participants} />
      )}
    </div>
  )
}