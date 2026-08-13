export type SessionStatus = "waiting" | "active" | "ended"

export interface Presentation {
  id: string
  title: string
  created_at?: string
}

export interface Session {
  id: string
  presentation_id: string
  code: string
  status: SessionStatus
  current_slide: number
  created_at?: string
}

export interface Participant {
  id: string
  session_id: string
  name: string
  score: number
  joined_at?: string
}
