import Link from "next/link"
import { ArrowLeft, Users } from "lucide-react"
import { StudentJoin } from "@/components/student/student-join"

export default function StudentPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary">
              <Users className="size-5 text-primary-foreground" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Join a session</h1>
              <p className="text-xs text-muted-foreground">Enter a room code to follow along live</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to home</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <StudentJoin />
      </div>
    </main>
  )
}
