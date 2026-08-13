import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Browser-side Supabase client (singleton).
 *
 * Uses the existing project env vars:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * Existing public schema (do not modify):
 *
 *  presentations
 *    id          bigint (pk, identity)
 *    title       text
 *    created_at  timestamptz
 *
 *  sessions            -- a live "room" instance of a presentation
 *    id              bigint (pk, identity)
 *    presentation_id bigint (fk -> presentations.id)
 *    room_code       text  (unique 6-digit room code)
 *    current_slide   int   (default 1)
 *    status          text  (default 'waiting' | 'active' | 'ended')
 *    created_at      timestamptz
 *
 *  participants        -- students who joined a session
 *    id             bigint (pk, identity)
 *    session_id     bigint (fk -> sessions.id)
 *    name           text
 *    student_number text
 *    score          int  (default 0)
 *    created_at     timestamptz
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
