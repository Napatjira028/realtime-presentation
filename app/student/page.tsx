import Link from "next/link"
import { ArrowLeft, Users } from "lucide-react"

export default function StudentPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent">
        <Users className="size-7 text-primary" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-balance">Join a session</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
        This is where you&apos;ll enter a room code to join a live presentation, follow synchronized
        slides, answer questions in real time, and track your score. The join flow is coming next.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to home
      </Link>
    </main>
  )
}
