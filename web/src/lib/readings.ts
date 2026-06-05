import { findBook, findChapter, loadBible } from './bible'

const ABBR_TO_BOOK_ID: Record<string, number> = {
  Gen: 1,
  Ex: 2,
  Lev: 3,
  Num: 4,
  Deut: 5,
  Josh: 6,
  Judg: 7,
  Rth: 8,
  '1Sam': 9,
  '2Sam': 10,
  '1King': 11,
  '2King': 12,
  '1Chron': 13,
  '2Chron': 14,
  Ezr: 15,
  Nehem: 16,
  Esth: 17,
  Job: 18,
  Ps: 19,
  Prov: 20,
  Eccl: 21,
  Song: 22,
  Is: 23,
  Jer: 24,
  Lam: 25,
  Ezek: 26,
  Dan: 27,
  Hos: 28,
  Joel: 29,
  Amos: 30,
  Obad: 31,
  Jonah: 32,
  Mic: 33,
  Nah: 34,
  Hab: 35,
  Zeph: 36,
  Hag: 37,
  Zech: 38,
  Mal: 39,
  Matt: 40,
  Mark: 41,
  Luke: 42,
  John: 43,
  Acts: 44,
  Rom: 45,
  '1Cor': 46,
  '2Cor': 47,
  Gal: 48,
  Eph: 49,
  Phil: 50,
  Col: 51,
  '1Thess': 52,
  '2Thess': 53,
  '1Tim': 54,
  '2Tim': 55,
  Titus: 56,
  Phlm: 57,
  Heb: 58,
  Jas: 59,
  '1Pet': 60,
  '2Pet': 61,
  '1John': 62,
  '2John': 63,
  '3John': 64,
  Jude: 65,
  Rev: 66,
}

export type ParsedReading = {
  bookId: number
  ranges: { chapterId: number; from: number; to: number }[]
}

// code looks like: "Gen.10:32-11:9" or "Is.28:14-22"
export function parseAzbykaCode(code: string): ParsedReading | null {
  const raw = code.trim()
  const m = raw.match(/^([1-3]?[A-Za-z]+)\.(\d+):(\d+)(?:-(\d+)(?::(\d+))?)?$/)
  if (!m) return null

  const abbr = m[1]
  const ch1 = Number(m[2])
  const v1 = Number(m[3])
  const maybeChOrV2 = m[4] ? Number(m[4]) : null
  const maybeV2 = m[5] ? Number(m[5]) : null

  const bookId = ABBR_TO_BOOK_ID[abbr]
  if (!bookId) return null

  // If we have "-22" => same chapter v1..v2
  if (maybeChOrV2 != null && maybeV2 == null) {
    return { bookId, ranges: [{ chapterId: ch1, from: v1, to: maybeChOrV2 }] }
  }

  // If we have "-11:9" => span chapters
  if (maybeChOrV2 != null && maybeV2 != null) {
    const ch2 = maybeChOrV2
    const v2 = maybeV2
    if (ch2 < ch1) return null
    if (ch2 === ch1) return { bookId, ranges: [{ chapterId: ch1, from: v1, to: v2 }] }
    return {
      bookId,
      ranges: [
        { chapterId: ch1, from: v1, to: Number.MAX_SAFE_INTEGER },
        ...Array.from({ length: Math.max(0, ch2 - ch1 - 1) }, (_, i) => ({ chapterId: ch1 + 1 + i, from: 1, to: Number.MAX_SAFE_INTEGER })),
        { chapterId: ch2, from: 1, to: v2 },
      ],
    }
  }

  return null
}

export async function resolveReadingText(code: string) {
  const parsed = parseAzbykaCode(code)
  if (!parsed) return null

  const books = await loadBible()
  const book = findBook(books, parsed.bookId)
  if (!book) return null

  const chunks: { chapterId: number; verses: { id: number; text: string }[] }[] = []
  for (const r of parsed.ranges) {
    const ch = findChapter(book, r.chapterId)
    if (!ch) continue
    const verses = (ch.Verses || [])
      .filter((v) => v.VerseId >= r.from && v.VerseId <= r.to)
      .map((v) => ({ id: v.VerseId, text: v.Text }))
    if (verses.length) chunks.push({ chapterId: r.chapterId, verses })
  }

  if (!chunks.length) return null
  return { bookId: parsed.bookId, chunks }
}

