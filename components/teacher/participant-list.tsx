"use client"

import { Users } from "lucide-react"
import type { Participant } from "@/lib/types"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?"
}

export function ParticipantList({ participants }: { participants: Participant[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="students-heading">
      <div className="flex items-center justify-between">
        <h2 id="students-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" aria-hidden="true" />
          Students joined
        </h2>
        <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground tabular-nums">
          {participants.length}
        </span>
      </div>

      {participants.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground text-pretty">
          Waiting for students to join with the room code…
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                aria-hidden="true"
              >
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                {p.student_number && (
                  <span className="block truncate text-xs text-muted-foreground">#{p.student_number}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
