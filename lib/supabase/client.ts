import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Browser-side Supabase client (singleton).
 *
 * Uses the existing project env vars:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * Assumed schema (adjust if your columns differ):
 *
 *  presentations
 *    id          uuid  (pk)
 *    title       text
 *    created_at  timestamptz
 *
 *  sessions            -- a live "room" instance of a presentation
 *    id              uuid (pk)
 *    presentation_id uuid (fk -> presentations.id)
 *    code            text  (unique 6-digit room code)
 *    status          text  ('waiting' | 'active' | 'ended')
 *    current_slide   int   (default 0)
 *    created_at      timestamptz
 *
 *  participants        -- students who joined a session
 *    id          uuid (pk)
 *    session_id  uuid (fk -> sessions.id)
 *    name        text
 *    score       int  (default 0)
 *    joined_at   timestamptz
 *
 *  questions, answers  -- used by later steps (quiz flow)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

let client: SupabaseClient | null = null

/**
 * Returns the shared browser client, or null when env vars are not set.
 * Callers should handle the null case and surface a configuration notice.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (client) return client
  client = createClient(supabaseUrl as string, supabaseKey as string, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  return client
}
