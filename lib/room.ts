/** Generates a random 6-digit room code (100000–999999). */
export function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
