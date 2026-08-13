import { AlertTriangle } from "lucide-react"

export function ConfigNotice() {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 p-5 text-left"
    >
      <div className="flex items-center gap-2 text-amber-900">
        <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Supabase is not configured</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-amber-800">
        {
          "This dashboard needs the environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. They exist in your Vercel project settings — once they are synced to this environment (or after deploying), room management will work automatically."
        }
      </p>
    </div>
  )
}
