"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Clock3, Flame, Loader2, Radio, Star, Trophy, Zap } from "lucide-react"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import type { Participant, Session } from "@/lib/types"
import { ConfigNotice } from "@/components/config-notice"
import { PdfStage } from "@/components/presentation/pdf-stage"

type MatchingPair = {
  id: string
  left: string
  right: string
}

type QuestionRow = {
  id: number
  presentation_id: number
  slide_number: number
  question: string
  choice_a: string | null
  choice_b: string | null
  choice_c: string | null
  choice_d: string | null
  correct_answer: string | null
  points: number
  time_limit: number | null
  speed_bonus: number | null
  question_type: "multiple_choice" | "matching" | string
  matching_pairs: MatchingPair[] | null
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

function normalizeAnswer(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "")
}

function correctChoiceKey(question: QuestionRow) {
  const raw = normalizeAnswer(question.correct_answer)

  const aliases: Record<string, "A" | "B" | "C" | "D"> = {
    a: "A",
    b: "B",
    c: "C",
    d: "D",
    choicea: "A",
    choiceb: "B",
    choicec: "C",
    choiced: "D",
    choice_a: "A",
    choice_b: "B",
    choice_c: "C",
    choice_d: "D",
  }

  if (aliases[raw]) return aliases[raw]

  const values: Array<["A" | "B" | "C" | "D", string | null]> = [
    ["A", question.choice_a],
    ["B", question.choice_b],
    ["C", question.choice_c],
    ["D", question.choice_d],
  ]

  return values.find(([, value]) => normalizeAnswer(value) === raw)?.[0] ?? null
}


function getMatchingPairs(question: QuestionRow | null): MatchingPair[] {
  if (!question || question.question_type !== "matching") return []
  return Array.isArray(question.matching_pairs)
    ? question.matching_pairs.filter(
        (pair): pair is MatchingPair =>
          Boolean(pair) &&
          typeof pair.id === "string" &&
          typeof pair.left === "string" &&
          typeof pair.right === "string",
      )
    : []
}

function matchingRightItems(pairs: MatchingPair[]) {
  if (pairs.length <= 1) return pairs
  return [...pairs.slice(1), pairs[0]]
}

function parseMatchingAnswer(answer: string | null | undefined): Record<string, string> {
  if (!answer) return {}
  try {
    const parsed = JSON.parse(answer)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

export function StudentJoin() {
  const [roomCode, setRoomCode] = useState("")
  const [name, setName] = useState("")
  const [studentNumber, setStudentNumber] = useState("")
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Set once the student has successfully joined.
  const [session, setSession] = useState<Session | null>(null)
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const [activeQuestion, setActiveQuestion] = useState<QuestionRow | null>(null)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [matchingSelections, setMatchingSelections] = useState<Record<string, string>>({})
  const [selectedMatchingLeft, setSelectedMatchingLeft] = useState<string | null>(null)
  const [submittedAnswer, setSubmittedAnswer] = useState<AnswerRow | null>(null)
  const [answerSubmitting, setAnswerSubmitting] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(15)
  const [timeExpired, setTimeExpired] = useState(false)
  const [totalScore, setTotalScore] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [finalRank, setFinalRank] = useState<number | null>(null)
  const [finalParticipantCount, setFinalParticipantCount] = useState(0)
  const [finalCorrectAnswers, setFinalCorrectAnswers] = useState(0)
  const [finalAnsweredQuestions, setFinalAnsweredQuestions] = useState(0)
  const questionStartedAtRef = useRef<number>(Date.now())


  const refreshQuestion = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session?.presentation_id || !session?.current_slide) return

    setQuestionLoading(true)

    const { data, error: qErr } = await supabase
      .from("questions")
      .select("*")
      .eq("presentation_id", session.presentation_id)
      .eq("slide_number", session.current_slide)
      .maybeSingle()

    if (qErr) {
      console.error("Failed to load slide question:", qErr)
      setQuestionLoading(false)
      return
    }

    const nextQuestion = (data as QuestionRow | null) ?? null

    setActiveQuestion((current) => {
      if (current?.id !== nextQuestion?.id) {
        const nextLimit = Math.max(5, nextQuestion?.time_limit ?? 15)
        setSelectedAnswer(null)
        setMatchingSelections({})
        setSelectedMatchingLeft(null)
        setSubmittedAnswer(null)
        setTimeRemaining(nextLimit)
        setTimeExpired(false)
        questionStartedAtRef.current = Date.now()
      }
      return nextQuestion
    })

    if (nextQuestion && participant?.id) {
      const { data: existing } = await supabase
        .from("answers")
        .select("*")
        .eq("participant_id", participant.id)
        .eq("question_id", nextQuestion.id)
        .maybeSingle()

      if (existing) {
        const existingAnswer = existing as AnswerRow
        setSubmittedAnswer(existingAnswer)
        if (nextQuestion.question_type === "matching") {
          setMatchingSelections(parseMatchingAnswer(existingAnswer.answer))
          setSelectedMatchingLeft(null)
          setSelectedAnswer(null)
        } else {
          setSelectedAnswer(existingAnswer.answer)
          setMatchingSelections({})
          setSelectedMatchingLeft(null)
        }
      }
    }

    setQuestionLoading(false)
  }, [session?.presentation_id, session?.current_slide, participant?.id])

  useEffect(() => {
    if (!session?.presentation_id || !participant?.id) return

    refreshQuestion()

    const supabase = getSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel(`questions:${session.presentation_id}:${participant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "questions",
          filter: `presentation_id=eq.${session.presentation_id}`,
        },
        () => refreshQuestion(),
      )
      .subscribe()

    const timer = setInterval(refreshQuestion, 3000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
    }
  }, [session?.presentation_id, participant?.id, refreshQuestion])


  useEffect(() => {
    if (!activeQuestion) {
      setTimeRemaining(15)
      setTimeExpired(false)
      return
    }

    const timeLimit = Math.max(5, activeQuestion.time_limit ?? 15)

    if (submittedAnswer) {
      const used = Math.max(0, submittedAnswer.response_time ?? 0)
      setTimeRemaining(Math.max(0, timeLimit - used))
      setTimeExpired(false)
      return
    }

    const updateCountdown = () => {
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - questionStartedAtRef.current) / 1000),
      )
      const remaining = Math.max(0, timeLimit - elapsed)

      setTimeRemaining(remaining)

      if (remaining <= 0) {
        setTimeExpired(true)
      }
    }

    updateCountdown()
    const timer = window.setInterval(updateCountdown, 250)

    return () => window.clearInterval(timer)
  }, [activeQuestion?.id, activeQuestion?.time_limit, submittedAnswer?.id])


  const refreshGameStatus = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !participant?.id) return

    const { data: myAnswers, error: answersErr } = await supabase
      .from("answers")
      .select("score, is_correct, created_at")
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: true })

    if (answersErr) {
      console.error("Failed to load student game status:", answersErr)
      return
    }

    const answers = (myAnswers ?? []) as Array<{
      score: number | null
      is_correct: boolean | null
      created_at?: string
    }>

    const score = answers.reduce((sum, answer) => sum + Number(answer.score ?? 0), 0)
    setTotalScore(score)

    let streak = 0
    for (let index = answers.length - 1; index >= 0; index -= 1) {
      if (answers[index].is_correct) streak += 1
      else break
    }
    setCurrentStreak(streak)
  }, [participant?.id])

  useEffect(() => {
    if (!session?.id || !participant?.id) return

    refreshGameStatus()

    const supabase = getSupabaseClient()
    if (!supabase) return

    const answersChannel = supabase
      .channel(`student-game-status-answers:${session.id}:${participant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers" },
        () => refreshGameStatus(),
      )
      .subscribe()

    const timer = window.setInterval(refreshGameStatus, 2500)

    return () => {
      supabase.removeChannel(answersChannel)
      window.clearInterval(timer)
    }
  }, [session?.id, participant?.id, refreshGameStatus])


  const refreshFinalResult = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !session?.id || !participant?.id) return

    const { data: sessionParticipants, error: participantsErr } = await supabase
      .from("participants")
      .select("id, name")
      .eq("session_id", session.id)

    if (participantsErr) {
      console.error("Failed to load final participants:", participantsErr)
      return
    }

    const participantRows = (sessionParticipants ?? []) as Array<{
      id: number
      name: string
    }>

    setFinalParticipantCount(participantRows.length)

    if (participantRows.length === 0) {
      setFinalRank(null)
      setFinalCorrectAnswers(0)
      setFinalAnsweredQuestions(0)
      return
    }

    const participantIds = participantRows.map((row) => row.id)

    const { data: allAnswers, error: answersErr } = await supabase
      .from("answers")
      .select("participant_id, score, is_correct")
      .in("participant_id", participantIds)

    if (answersErr) {
      console.error("Failed to load final answers:", answersErr)
      return
    }

    const totals = new Map<
      number,
      { score: number; correctAnswers: number; answeredQuestions: number; name: string }
    >()

    for (const row of participantRows) {
      totals.set(row.id, {
        score: 0,
        correctAnswers: 0,
        answeredQuestions: 0,
        name: row.name,
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

    const ranked = Array.from(totals.entries())
      .map(([participantId, value]) => ({ participantId, ...value }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.correctAnswers !== a.correctAnswers) {
          return b.correctAnswers - a.correctAnswers
        }
        return a.name.localeCompare(b.name, "th")
      })
      .map((row, index, rows) => {
        const previous = rows[index - 1]
        const tiedWithPrevious =
          previous &&
          previous.score === row.score &&
          previous.correctAnswers === row.correctAnswers

        return {
          ...row,
          rank: tiedWithPrevious ? previous.rank : index + 1,
        }
      })

    const mine = ranked.find((row) => row.participantId === participant.id)
    if (!mine) {
      setFinalRank(null)
      setFinalCorrectAnswers(0)
      setFinalAnsweredQuestions(0)
      return
    }

    setFinalRank(mine.rank)
    setTotalScore(mine.score)
    setFinalCorrectAnswers(mine.correctAnswers)
    setFinalAnsweredQuestions(mine.answeredQuestions)
  }, [session?.id, participant?.id])

  useEffect(() => {
    if (!session?.id || !participant?.id || session.status !== "ended") return

    refreshGameStatus()
    refreshFinalResult()

    const supabase = getSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel(`student-final-result:${session.id}:${participant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers" },
        () => {
          refreshGameStatus()
          refreshFinalResult()
        },
      )
      .subscribe()

    const timer = window.setInterval(() => {
      refreshGameStatus()
      refreshFinalResult()
    }, 2500)

    return () => {
      supabase.removeChannel(channel)
      window.clearInterval(timer)
    }
  }, [
    session?.id,
    session?.status,
    participant?.id,
    refreshGameStatus,
    refreshFinalResult,
  ])

  const submitAnswer = useCallback(
    async (choice: "A" | "B" | "C" | "D") => {
      const supabase = getSupabaseClient()
      if (
        !supabase ||
        !participant ||
        !activeQuestion ||
        submittedAnswer ||
        answerSubmitting ||
        timeExpired
      ) {
        return
      }

      const timeLimit = Math.max(5, activeQuestion.time_limit ?? 15)
      const responseTime = Math.max(
        0,
        Math.floor((Date.now() - questionStartedAtRef.current) / 1000),
      )

      if (responseTime >= timeLimit) {
        setTimeRemaining(0)
        setTimeExpired(true)
        return
      }

      setSelectedAnswer(choice)
      setAnswerSubmitting(true)
      setError(null)

      try {
        const { data: existing, error: existingErr } = await supabase
          .from("answers")
          .select("*")
          .eq("participant_id", participant.id)
          .eq("question_id", activeQuestion.id)
          .maybeSingle()

        if (existingErr) throw existingErr

        if (existing) {
          setSubmittedAnswer(existing as AnswerRow)
          setSelectedAnswer((existing as AnswerRow).answer)
          return
        }

        const correctKey = correctChoiceKey(activeQuestion)
        const isCorrect = correctKey === choice
        const basePoints = Math.max(1, activeQuestion.points ?? 1)
        const maxSpeedBonus = Math.max(0, activeQuestion.speed_bonus ?? 0)

        // Bonus falls gradually from the configured maximum down to zero.
        // A correct answer is always required before any bonus is awarded.
        const speedRatio = Math.max(0, (timeLimit - responseTime) / timeLimit)
        // Use Math.ceil so very fast correct answers can receive the full configured
        // speed bonus. Example: 15s limit, base 1, max bonus 5, answer in 2s
        // => speedRatio 13/15, bonus ceil(5 * 13/15) = 5, total score = 6.
        const earnedSpeedBonus = isCorrect
          ? Math.max(0, Math.ceil(maxSpeedBonus * speedRatio))
          : 0
        const score = isCorrect ? basePoints + earnedSpeedBonus : 0

        const { data, error: insertErr } = await supabase
          .from("answers")
          .insert({
            participant_id: participant.id,
            question_id: activeQuestion.id,
            answer: choice,
            is_correct: isCorrect,
            score,
            response_time: responseTime,
          })
          .select()
          .single()

        if (insertErr) throw insertErr
        setSubmittedAnswer(data as AnswerRow)
        refreshGameStatus()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit your answer.")
      } finally {
        setAnswerSubmitting(false)
      }
    },
    [participant, activeQuestion, submittedAnswer, answerSubmitting, timeExpired, refreshGameStatus],
  )

  const selectMatchingLeft = useCallback(
    (leftId: string) => {
      if (submittedAnswer || answerSubmitting || timeExpired) return
      setSelectedMatchingLeft((current) => (current === leftId ? null : leftId))
    },
    [submittedAnswer, answerSubmitting, timeExpired],
  )

  const selectMatchingRight = useCallback(
    (rightId: string) => {
      if (
        !selectedMatchingLeft ||
        submittedAnswer ||
        answerSubmitting ||
        timeExpired
      ) {
        return
      }

      setMatchingSelections((current) => {
        const next = { ...current }

        for (const [leftId, selectedRightId] of Object.entries(next)) {
          if (selectedRightId === rightId && leftId !== selectedMatchingLeft) {
            delete next[leftId]
          }
        }

        next[selectedMatchingLeft] = rightId
        return next
      })
      setSelectedMatchingLeft(null)
    },
    [
      selectedMatchingLeft,
      submittedAnswer,
      answerSubmitting,
      timeExpired,
    ],
  )

  const submitMatchingAnswer = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (
      !supabase ||
      !participant ||
      !activeQuestion ||
      activeQuestion.question_type !== "matching" ||
      submittedAnswer ||
      answerSubmitting ||
      timeExpired
    ) {
      return
    }

    const pairs = getMatchingPairs(activeQuestion)
    if (pairs.length === 0) {
      setError("This matching question has no pairs.")
      return
    }

    if (Object.keys(matchingSelections).length !== pairs.length) {
      setError("Please match every item before submitting.")
      return
    }

    const timeLimit = Math.max(5, activeQuestion.time_limit ?? 15)
    const responseTime = Math.max(
      0,
      Math.floor((Date.now() - questionStartedAtRef.current) / 1000),
    )

    if (responseTime >= timeLimit) {
      setTimeRemaining(0)
      setTimeExpired(true)
      return
    }

    setAnswerSubmitting(true)
    setError(null)

    try {
      const { data: existing, error: existingErr } = await supabase
        .from("answers")
        .select("*")
        .eq("participant_id", participant.id)
        .eq("question_id", activeQuestion.id)
        .maybeSingle()

      if (existingErr) throw existingErr

      if (existing) {
        const existingAnswer = existing as AnswerRow
        setSubmittedAnswer(existingAnswer)
        setMatchingSelections(parseMatchingAnswer(existingAnswer.answer))
        return
      }

      const correctCount = pairs.reduce(
        (count, pair) =>
          count + (matchingSelections[pair.id] === pair.id ? 1 : 0),
        0,
      )
      const isCorrect = correctCount === pairs.length

      const basePoints = Math.max(1, activeQuestion.points ?? pairs.length)
      const maxSpeedBonus = Math.max(0, activeQuestion.speed_bonus ?? 0)
      const earnedBasePoints =
        correctCount === 0
          ? 0
          : Math.max(
              1,
              Math.round((basePoints * correctCount) / pairs.length),
            )

      const speedRatio = Math.max(0, (timeLimit - responseTime) / timeLimit)
      const earnedSpeedBonus = isCorrect
        ? Math.max(0, Math.ceil(maxSpeedBonus * speedRatio))
        : 0
      const score = earnedBasePoints + earnedSpeedBonus

      const { data, error: insertErr } = await supabase
        .from("answers")
        .insert({
          participant_id: participant.id,
          question_id: activeQuestion.id,
          answer: JSON.stringify(matchingSelections),
          is_correct: isCorrect,
          score,
          response_time: responseTime,
        })
        .select()
        .single()

      if (insertErr) throw insertErr
      setSubmittedAnswer(data as AnswerRow)
      refreshGameStatus()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not submit your matching answer.",
      )
    } finally {
      setAnswerSubmitting(false)
    }
  }, [
    participant,
    activeQuestion,
    matchingSelections,
    submittedAnswer,
    answerSubmitting,
    timeExpired,
    refreshGameStatus,
  ])

  const configured = isSupabaseConfigured
  const refreshPdfUrl = useCallback(async (presentationId: number) => {
  const supabase = getSupabaseClient()
  if (!supabase) return

  const { data, error } = await supabase
    .from("presentations")
    .select("file_url")
    .eq("id", presentationId)
    .maybeSingle()

  if (error) {
    console.error("Failed to load presentation PDF:", error)
    return
  }

  setPdfUrl(data?.file_url ?? null)
}, [])
useEffect(() => {
  const presentationId = session?.presentation_id
  if (!presentationId) return

  const supabase = getSupabaseClient()
  if (!supabase) return

  // Load immediately, then keep watching in case the teacher uploads/replaces
  // the PDF after students have already joined the room.
  refreshPdfUrl(presentationId)

  const channel = supabase
    .channel(`student-presentation-file:${presentationId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "presentations",
        filter: `id=eq.${presentationId}`,
      },
      (payload) => {
        const nextUrl = (payload.new as { file_url?: string | null })?.file_url ?? null
        setPdfUrl(nextUrl)
        if (!nextUrl) refreshPdfUrl(presentationId)
      },
    )
    .subscribe()

  // Polling fallback in case Realtime replication is not enabled.
  const timer = window.setInterval(() => {
    refreshPdfUrl(presentationId)
  }, 2000)

  return () => {
    supabase.removeChannel(channel)
    window.clearInterval(timer)
  }
}, [session?.presentation_id, refreshPdfUrl])

  const handleJoin = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const supabase = getSupabaseClient()
      if (!supabase) return

      const code = roomCode.trim()
      const trimmedName = name.trim()

      if (!/^\d{6}$/.test(code)) {
        setError("Enter the 6-digit room code from your teacher.")
        return
      }
      if (!trimmedName) {
        setError("Please enter your name.")
        return
      }

      setJoining(true)
      setError(null)
      try {
        // 1. Find the session for this room code.
        const { data: found, error: sErr } = await supabase
          .from("sessions")
          .select("*")
          .eq("room_code", code)
          .maybeSingle()
        if (sErr) throw sErr
        if (!found) {
          setError("No session found with that room code. Double-check and try again.")
          return
        }
        const foundSession = found as Session

        if (foundSession.status === "ended") {
          setError("This session has already ended.")
          return
        }

        // 2. Insert the student into participants for this session.
        const { data: inserted, error: pErr } = await supabase
          .from("participants")
          .insert({
            session_id: foundSession.id,
            name: trimmedName,
            student_number: studentNumber.trim() || null,
          })
          .select()
          .single()
        if (pErr) throw pErr

        setSession(foundSession)
        await refreshPdfUrl(foundSession.presentation_id)
        setParticipant(inserted as Participant)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join the session.")
      } finally {
        setJoining(false)
      }
    },
    [roomCode, name, studentNumber],
  )

  // ---- Keep the joined student in sync with the session status ----------
  const sessionId = session?.id
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshSession = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase || !sessionId) return
    const { data } = await supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle()
    if (data) setSession(data as Session)
  }, [sessionId])

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase || !sessionId) return

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => setSession(payload.new as Session),
      )
      .subscribe()

    // Polling fallback if realtime replication is not enabled on the table.
    pollRef.current = setInterval(refreshSession, 4000)

    return () => {
      supabase.removeChannel(channel)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [sessionId, refreshSession])

  if (!configured) {
    return <ConfigNotice />
  }

  // ---- Live presentation view -------------------------------------------
  if (session && participant && session.status === "active") {
    const choices: Array<{ key: "A" | "B" | "C" | "D"; text: string | null }> = activeQuestion
      ? [
          { key: "A", text: activeQuestion.choice_a },
          { key: "B", text: activeQuestion.choice_b },
          { key: "C", text: activeQuestion.choice_c },
          { key: "D", text: activeQuestion.choice_d },
        ]
      : []

    const matchingPairs = getMatchingPairs(activeQuestion)
    const matchingRight = matchingRightItems(matchingPairs)
    const matchingComplete =
      matchingPairs.length > 0 &&
      Object.keys(matchingSelections).length === matchingPairs.length

    return (
      <div className="relative left-1/2 w-[calc(100vw-1rem)] -translate-x-1/2 px-2 pb-3 text-center sm:w-[calc(100vw-2rem)] sm:px-3">
        <div className="mx-auto mb-3 flex w-full max-w-6xl items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary">
              <Radio className="size-4 text-primary-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                  <Radio className="size-3" aria-hidden="true" />
                  Live
                </span>
                <span className="text-sm font-semibold">
                  Slide {session.current_slide ?? 1}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                {participant.name}, follow the teacher&apos;s presentation.
              </p>
            </div>
          </div>

          <span className="hidden text-xs text-muted-foreground sm:block">
            Updates automatically
          </span>
        </div>

        <div className="mx-auto mb-3 grid w-full max-w-5xl grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-xl border border-border bg-card px-2 py-2.5 text-center shadow-sm sm:px-4">
            <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Star className="size-3.5 text-amber-500" aria-hidden="true" />
              Total score
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums text-primary sm:text-xl">
              {totalScore}
            </p>
            <p className="text-[10px] text-muted-foreground sm:text-xs">points</p>
          </div>

          <div className="rounded-xl border border-border bg-card px-2 py-2.5 text-center shadow-sm sm:px-4">
            <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Flame className="size-3.5 text-orange-500" aria-hidden="true" />
              Streak
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums text-primary sm:text-xl">
              {currentStreak}
            </p>
            <p className="text-[10px] text-muted-foreground sm:text-xs">
              correct in a row
            </p>
          </div>
        </div>

        {activeQuestion && (
          <section className="mx-auto mb-4 w-full max-w-5xl rounded-2xl border border-primary/20 bg-card p-4 text-left shadow-lg sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Question · Slide {activeQuestion.slide_number}
                </p>
                <h2 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">
                  {activeQuestion.question}
                </h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tabular-nums ${
                    timeExpired && !submittedAnswer
                      ? "bg-destructive/10 text-destructive"
                      : timeRemaining <= 5 && !submittedAnswer
                        ? "bg-amber-100 text-amber-900"
                        : "bg-primary text-primary-foreground"
                  }`}
                >
                  <Clock3 className="size-3.5" aria-hidden="true" />
                  {submittedAnswer
                    ? `${submittedAnswer.response_time ?? 0}s`
                    : `${timeRemaining}s`}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  <Zap className="size-3.5" aria-hidden="true" />
                  {(activeQuestion.points ?? 1) + (activeQuestion.speed_bonus ?? 0)} max
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  🎯 Base {activeQuestion.points ?? 1} + ⚡ up to {activeQuestion.speed_bonus ?? 0} bonus
                </span>
                {!submittedAnswer && (
                  <span className={timeRemaining <= 5 ? "font-semibold text-amber-700" : ""}>
                    Answer faster for more points
                  </span>
                )}
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (timeRemaining / Math.max(5, activeQuestion.time_limit ?? 15)) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>

            {activeQuestion.question_type === "matching" ? (
              <div className="mt-5">
                <div className="mb-3 rounded-xl bg-primary/5 px-4 py-3 text-sm text-primary">
                  🧩 เลือกข้อความฝั่งซ้าย แล้วเลือกคำตอบฝั่งขวาเพื่อโยงเส้นให้ครบทุกคู่
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-border bg-background p-3 sm:p-4">
                  <svg
                    className="pointer-events-none absolute inset-0 z-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {matchingPairs.map((pair, leftIndex) => {
                      const rightId = matchingSelections[pair.id]
                      if (!rightId) return null

                      const rightIndex = matchingRight.findIndex(
                        (rightPair) => rightPair.id === rightId,
                      )
                      if (rightIndex < 0) return null

                      const count = Math.max(1, matchingPairs.length)
                      const y1 = ((leftIndex + 0.5) / count) * 100
                      const y2 = ((rightIndex + 0.5) / count) * 100

                      return (
                        <path
                          key={`${pair.id}-${rightId}`}
                          d={`M 44 ${y1} C 48 ${y1}, 52 ${y2}, 56 ${y2}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="0.9"
                          className="text-primary"
                          vectorEffect="non-scaling-stroke"
                        />
                      )
                    })}
                  </svg>

                  <div className="relative z-10 grid grid-cols-[1fr_42px_1fr] gap-2 sm:grid-cols-[1fr_64px_1fr] sm:gap-3">
                    <div className="grid gap-3">
                      {matchingPairs.map((pair) => {
                        const isSelected = selectedMatchingLeft === pair.id
                        const hasConnection = Boolean(matchingSelections[pair.id])

                        return (
                          <button
                            key={pair.id}
                            type="button"
                            disabled={Boolean(submittedAnswer) || answerSubmitting || timeExpired}
                            onClick={() => selectMatchingLeft(pair.id)}
                            className={`relative flex min-h-16 items-center justify-between rounded-xl border px-3 py-3 text-left transition sm:px-4 ${
                              isSelected
                                ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                                : hasConnection
                                  ? "border-primary/50 bg-primary/5"
                                  : "border-border bg-card hover:border-primary/40"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <span className="pr-3 text-sm font-medium sm:text-base">
                              {pair.left}
                            </span>
                            <span
                              className={`size-4 shrink-0 rounded-full border-2 ${
                                isSelected || hasConnection
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/40 bg-background"
                              }`}
                            />
                          </button>
                        )
                      })}
                    </div>

                    <div />

                    <div className="grid gap-3">
                      {matchingRight.map((pair) => {
                        const isUsed = Object.values(matchingSelections).includes(pair.id)
                        const waitingForRight = Boolean(selectedMatchingLeft)

                        return (
                          <button
                            key={pair.id}
                            type="button"
                            disabled={
                              Boolean(submittedAnswer) ||
                              answerSubmitting ||
                              timeExpired ||
                              !waitingForRight
                            }
                            onClick={() => selectMatchingRight(pair.id)}
                            className={`relative flex min-h-16 items-center gap-3 rounded-xl border px-3 py-3 text-left transition sm:px-4 ${
                              isUsed
                                ? "border-primary/50 bg-primary/5"
                                : waitingForRight
                                  ? "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
                                  : "border-border bg-card"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <span
                              className={`size-4 shrink-0 rounded-full border-2 ${
                                isUsed
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/40 bg-background"
                              }`}
                            />
                            <span className="text-sm font-medium sm:text-base">
                              {pair.right}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {!submittedAnswer && !timeExpired && (
                  <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:flex-row">
                    <p className="text-sm text-muted-foreground">
                      จับคู่แล้ว {Object.keys(matchingSelections).length}/{matchingPairs.length} คู่
                    </p>
                    <button
                      type="button"
                      disabled={!matchingComplete || answerSubmitting}
                      onClick={submitMatchingAnswer}
                      className="inline-flex min-w-40 items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {answerSubmitting ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                          กำลังส่ง...
                        </>
                      ) : (
                        "ส่งคำตอบ"
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {choices
                  .filter((choice) => Boolean(choice.text))
                  .map((choice) => {
                    const chosen = selectedAnswer === choice.key
                    const submitted = Boolean(submittedAnswer)

                    return (
                      <button
                        key={choice.key}
                        type="button"
                        disabled={submitted || answerSubmitting || timeExpired}
                        onClick={() => submitAnswer(choice.key)}
                        className={`flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          chosen
                            ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                            : "border-border bg-background hover:border-primary/40"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                          {choice.key}
                        </span>
                        <span className="text-sm font-medium sm:text-base">{choice.text}</span>
                      </button>
                    )
                  })}
              </div>
            )}

            {timeExpired && !submittedAnswer && (
              <div className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                ⏰ Time&apos;s up! This question is now locked.
              </div>
            )}

            {answerSubmitting && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Sending your answer...
              </div>
            )}

            {submittedAnswer && (
              <div
                className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
                  submittedAnswer.is_correct
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-900"
                }`}
              >
                {submittedAnswer.is_correct
                  ? `Correct! +${submittedAnswer.score} point${submittedAnswer.score === 1 ? "" : "s"} · answered in ${submittedAnswer.response_time ?? 0}s`
                  : `Answer submitted in ${submittedAnswer.response_time ?? 0}s.`}
              </div>
            )}
          </section>
        )}

        {questionLoading && !activeQuestion && (
          <div className="mx-auto mb-3 flex max-w-5xl items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Checking for a question on this slide...
          </div>
        )}

        {pdfUrl ? (
          <div
            className="mx-auto"
            style={{ width: activeQuestion ? "min(92vw, 116vh)" : "min(96vw, 145.78vh)" }}
          >
            <PdfStage
              fileUrl={pdfUrl}
              pageNumber={session.current_slide ?? 1}
              className="rounded-xl shadow-lg"
            />
          </div>
        ) : (
          <div className="mx-auto flex min-h-[60vh] w-[min(96vw,145.78vh)] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-6">
            <div>
              <Loader2 className="mx-auto size-7 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">
                Loading presentation...
              </p>
            </div>
          </div>
        )}

        {error && <p className="mx-auto mt-3 max-w-5xl text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // ---- Ended presentation view ------------------------------------------
  if (session && participant && session.status === "ended") {
    const resultsRevealed = Boolean(session.reveal_results)

    return (
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Trophy className="size-7 text-primary" aria-hidden="true" />
        </span>

        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Presentation ended
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-balance">
          Great work, {participant.name}!
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          The activity has finished. Your answers are locked and your final score has been saved.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Star className="size-4 text-amber-500" aria-hidden="true" />
              Final score
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-primary">
              {totalScore}
            </p>
            <p className="text-xs text-muted-foreground">points</p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs font-medium text-muted-foreground">
              Performance
            </div>
            <p className="mt-2 text-lg font-bold text-primary">
              {finalCorrectAnswers} correct
            </p>
            <p className="text-xs text-muted-foreground">
              {finalAnsweredQuestions} answered
            </p>
          </div>
        </div>

        {resultsRevealed ? (
          <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Your final rank
            </p>
            <p className="mt-2 text-5xl font-black tabular-nums text-primary">
              {finalRank ? `#${finalRank}` : "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              out of {finalParticipantCount} student{finalParticipantCount === 1 ? "" : "s"}
            </p>
            {finalRank === 1 && (
              <p className="mt-3 text-sm font-semibold text-amber-700">
                🥇 Congratulations — 1st place!
              </p>
            )}
            {finalRank === 2 && (
              <p className="mt-3 text-sm font-semibold text-slate-600">
                🥈 Congratulations — 2nd place!
              </p>
            )}
            {finalRank === 3 && (
              <p className="mt-3 text-sm font-semibold text-amber-800">
                🥉 Congratulations — 3rd place!
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5">
            <Loader2 className="mx-auto size-5 animate-spin text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold">
              Waiting for your teacher to reveal the results...
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your ranking is still hidden. This page will update automatically.
            </p>
          </div>
        )}

        <dl className="mt-5 space-y-2 text-left">
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <dt className="text-sm text-muted-foreground">Room code</dt>
            <dd className="font-mono text-sm font-bold tracking-[0.12em]">
              {session.room_code}
            </dd>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <dt className="text-sm text-muted-foreground">Student</dt>
            <dd className="text-sm font-medium">{participant.name}</dd>
          </div>
        </dl>
      </div>
    )
  }

  // ---- Waiting-room view ------------------------------------------------
  if (session && participant && session.status === "waiting") {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent">
          <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-balance">You&apos;re in!</h2>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          Waiting for your teacher to start the presentation.
        </p>

        <dl className="mt-6 space-y-3 text-left">
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <dt className="text-sm text-muted-foreground">Room code</dt>
            <dd className="font-mono text-base font-bold tracking-[0.15em] tabular-nums">
              {session.room_code}
            </dd>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <dt className="text-sm text-muted-foreground">Your name</dt>
            <dd className="text-sm font-medium">{participant.name}</dd>
          </div>
          {participant.student_number && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <dt className="text-sm text-muted-foreground">Student number</dt>
              <dd className="text-sm font-medium">#{participant.student_number}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Connected — this page will update automatically.
        </div>
      </div>
    )
  }

  // ---- Join form --------------------------------------------------------
  return (
    <form onSubmit={handleJoin} className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Join a live session</h2>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">
        Enter the room code your teacher shared, then tell us who you are.
      </p>

      <label htmlFor="roomCode" className="mt-6 block text-sm font-medium">
        Room code
      </label>
      <input
        id="roomCode"
        inputMode="numeric"
        autoComplete="off"
        value={roomCode}
        onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />

      <label htmlFor="name" className="mt-4 block text-sm font-medium">
        Student name
      </label>
      <input
        id="name"
        type="text"
        required
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Alex Rivera"
        className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />

      <label htmlFor="studentNumber" className="mt-4 block text-sm font-medium">
        Student number <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <input
        id="studentNumber"
        type="text"
        autoComplete="off"
        value={studentNumber}
        onChange={(e) => setStudentNumber(e.target.value)}
        placeholder="e.g. 2024-0158"
        className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={joining}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {joining ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4" aria-hidden="true" />
        )}
        {joining ? "Joining…" : "Join session"}
      </button>
    </form>
  )
}