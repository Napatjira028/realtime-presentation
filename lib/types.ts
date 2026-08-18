export type SessionStatus = "waiting" | "active" | "ended"

export interface Presentation {
  id: number
  title: string
  created_at?: string
}

export interface Session {
  id: number
  presentation_id: number
  room_code: string
  current_slide: number
  status: SessionStatus

  // The teacher controls when students are allowed to see their final rank.
  reveal_results?: boolean

  file_url: string | null
  file_path: string | null
  total_slides: number
  created_at?: string
}

export interface Participant {
  id: number
  session_id: number
  name: string
  student_number: string | null
  score: number
  created_at?: string
}