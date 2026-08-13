import { GraduationCap, Presentation, Radio, Users } from "lucide-react"
import { RoleCard } from "@/components/role-card"

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <Presentation className="size-5 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">PulsePresent</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <Radio className="size-3.5 text-primary" aria-hidden="true" />
          Real-time classroom engagement
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-12">
        <section className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Interactive presentations, perfectly in sync
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
            Deliver live lessons where every slide, question, and score updates instantly across
            the whole room. Choose how you want to start.
          </p>
        </section>

        <section className="mt-12 grid w-full gap-6 md:grid-cols-2">
          <RoleCard
            variant="primary"
            href="/teacher"
            icon={GraduationCap}
            eyebrow="For educators"
            title="Teacher"
            description="Create a room, drive the presentation, and keep the class engaged from one place."
            features={[
              "Create and manage presentation rooms",
              "Control slides for the whole room",
              "Ask live questions on the fly",
              "Track responses and scores",
            ]}
            cta="Start as Teacher"
          />
          <RoleCard
            href="/student"
            icon={Users}
            eyebrow="For learners"
            title="Student"
            description="Join with a room code and follow along, answering questions as they appear."
            features={[
              "Join instantly with a room code",
              "View synchronized slides live",
              "Answer questions in real time",
              "See your score as you go",
            ]}
            cta="Join as Student"
          />
        </section>
      </div>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-center text-xs text-muted-foreground">
        Built for classrooms, workshops, and live training sessions.
      </footer>
    </main>
  )
}
