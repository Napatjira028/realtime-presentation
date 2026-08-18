"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, Radio } from "lucide-react"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import type { Participant, Session } from "@/lib/types"
import { ConfigNotice } from "@/components/config-notice"
import { PdfStage } from "@/components/presentation/pdf-stage"

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
  if (!session?.presentation_id) return
  refreshPdfUrl(session.presentation_id)
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
    return (
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary">
          <Radio className="size-6 text-primary-foreground" aria-hidden="true" />
        </span>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
          <Radio className="size-3.5" aria-hidden="true" />
          Live now
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-balance">The presentation has started</h2>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          {participant.name}, you&apos;re following slide {session.current_slide}. Questions from your teacher
          will appear here in real time.
        </p>
        <div className="mt-6">
  {pdfUrl ? (
    <PdfStage
      fileUrl={pdfUrl}
      pageNumber={session.current_slide ?? 1}
    />
  ) : (
    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6">
      <p className="text-sm text-muted-foreground">
        Loading presentation...
      </p>
    </div>
  )}
</div>
      </div>
    )
  }

  // ---- Waiting-room view ------------------------------------------------
  if (session && participant) {
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
