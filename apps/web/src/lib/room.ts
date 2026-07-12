const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid code confusion

/** A short, shareable, unambiguous room code like "FGKQ". */
export function newRoomCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return s;
}
