export type BibleVerse = { VerseId: number; Text: string }
export type BibleChapter = { ChapterId: number; Verses: BibleVerse[] }
export type BibleBook = { BookId: number; BookName?: string; Chapters: BibleChapter[] }
export type BibleRoot = { Books: BibleBook[] }

let bibleCache: BibleBook[] | null = null

export const BOOK_NAMES: Record<number, string> = {
  1: 'Бытие',
  2: 'Исход',
  3: 'Левит',
  4: 'Числа',
  5: 'Второзаконие',
  6: 'Иисус Навин',
  7: 'Судьи',
  8: 'Руфь',
  9: '1-я Царств',
  10: '2-я Царств',
  11: '3-я Царств',
  12: '4-я Царств',
  13: '1-я Паралипоменон',
  14: '2-я Паралипоменон',
  15: 'Ездра',
  16: 'Неемия',
  17: 'Есфирь',
  18: 'Иов',
  19: 'Псалтирь',
  20: 'Притчи',
  21: 'Екклесиаст',
  22: 'Песнь Песней',
  23: 'Исаия',
  24: 'Иеремия',
  25: 'Плач Иеремии',
  26: 'Иезекииль',
  27: 'Даниил',
  28: 'Осия',
  29: 'Иоиль',
  30: 'Амос',
  31: 'Авдий',
  32: 'Иона',
  33: 'Михей',
  34: 'Наум',
  35: 'Аввакум',
  36: 'Софония',
  37: 'Аггей',
  38: 'Захария',
  39: 'Малахия',
  40: 'От Матфея',
  41: 'От Марка',
  42: 'От Луки',
  43: 'От Иоанна',
  44: 'Деяния',
  45: 'К Римлянам',
  46: '1-е Коринфянам',
  47: '2-е Коринфянам',
  48: 'К Галатам',
  49: 'К Ефесянам',
  50: 'К Филиппийцам',
  51: 'К Колосянам',
  52: '1-е Фессалоникийцам',
  53: '2-е Фессалоникийцам',
  54: '1-е Тимофею',
  55: '2-е Тимофею',
  56: 'К Титу',
  57: 'К Филимону',
  58: 'К Евреям',
  59: 'Иакова',
  60: '1-е Петра',
  61: '2-е Петра',
  62: '1-е Иоанна',
  63: '2-е Иоанна',
  64: '3-е Иоанна',
  65: 'Иуды',
  66: 'Откровение',
}

export function getBookName(bookId: number) {
  return BOOK_NAMES[Number(bookId)] || `Книга ${bookId}`
}

export async function loadBible(): Promise<BibleBook[]> {
  if (bibleCache) return bibleCache
  const res = await fetch('/bible.json', { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Не удалось загрузить bible.json (${res.status})`)
  const json = (await res.json()) as BibleRoot | { Books?: BibleBook[] }
  const books = (json as BibleRoot).Books || (json as { Books?: BibleBook[] }).Books || []
  if (!Array.isArray(books) || books.length === 0) throw new Error('bible.json: пустые данные')
  bibleCache = books
  return books
}

export function findBook(books: BibleBook[], bookId: number) {
  return books.find((b) => Number(b.BookId) === Number(bookId))
}

export function findChapter(book: BibleBook | undefined, chapterId: number) {
  return book?.Chapters?.find((c) => Number(c.ChapterId) === Number(chapterId))
}

export function formatRef(bookId: number, chapterId: number, verseId?: number | string) {
  const base = `${getBookName(bookId)} ${chapterId}`
  return verseId ? `${base}:${verseId}` : base
}

export type SearchHit = {
  bookId: number
  chapterId: number
  verseId: number
  text: string
}

export function searchInBible(books: BibleBook[], q: string, limit = 50): SearchHit[] {
  const needle = q.trim().toLowerCase()
  if (needle.length < 3) return []
  const out: SearchHit[] = []
  for (const b of books) {
    for (const c of b.Chapters || []) {
      for (const v of c.Verses || []) {
        if ((v.Text || '').toLowerCase().includes(needle)) {
          out.push({ bookId: b.BookId, chapterId: c.ChapterId, verseId: v.VerseId, text: v.Text })
          if (out.length >= limit) return out
        }
      }
    }
  }
  return out
}

export function pickRandomVerse(books: BibleBook[]) {
  const book = books[Math.floor(Math.random() * books.length)]
  const chapter = book.Chapters[Math.floor(Math.random() * book.Chapters.length)]
  const verse = chapter.Verses[Math.floor(Math.random() * chapter.Verses.length)]
  return { book, chapter, verse }
}

