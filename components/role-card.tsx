import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"

interface RoleCardProps {
  href: string
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  features: string[]
  cta: string
  variant?: "primary" | "outline"
}

export function RoleCard({
  href,
  icon: Icon,
  eyebrow,
  title,
  description,
  features,
  cta,
  variant = "outline",
}: RoleCardProps) {
  const isPrimary = variant === "primary"

  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border p-8 transition-all duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        isPrimary
          ? "border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
          : "border-border bg-card text-card-foreground hover:border-primary/40 hover:shadow-lg"
      }`}
    >
      <div
        className={`flex size-12 items-center justify-center rounded-xl ${
          isPrimary ? "bg-primary-foreground/15" : "bg-accent"
        }`}
      >
        <Icon
          className={`size-6 ${isPrimary ? "text-primary-foreground" : "text-primary"}`}
          aria-hidden="true"
        />
      </div>

      <p
        className={`mt-6 text-xs font-semibold uppercase tracking-widest ${
          isPrimary ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{title}</h2>
      <p
        className={`mt-2 text-sm leading-relaxed ${
          isPrimary ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {description}
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-sm">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                isPrimary ? "bg-primary-foreground/15" : "bg-accent"
              }`}
            >
              <ArrowRight
                className={`size-3 ${isPrimary ? "text-primary-foreground" : "text-primary"}`}
                aria-hidden="true"
              />
            </span>
            <span className={isPrimary ? "text-primary-foreground/90" : "text-foreground/80"}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <div
        className={`mt-8 flex items-center gap-2 text-sm font-semibold ${
          isPrimary ? "text-primary-foreground" : "text-primary"
        }`}
      >
        {cta}
        <ArrowRight
          className="size-4 transition-transform duration-200 group-hover:translate-x-1"
          aria-hidden="true"
        />
      </div>
    </Link>
  )
}
