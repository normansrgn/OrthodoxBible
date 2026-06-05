export type Bookmark = {
  bookId: number
  chapterId: number
  savedAt: number
  title?: string
}

const KEY = 'orthodoxBible.bookmarks.v1'

export function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as Bookmark[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveBookmarks(bm: Bookmark[]) {
  localStorage.setItem(KEY, JSON.stringify(bm))
}

export function toggleBookmark(bookId: number, chapterId: number, title?: string) {
  const bm = loadBookmarks()
  const idx = bm.findIndex((b) => b.bookId === bookId && b.chapterId === chapterId)
  if (idx >= 0) {
    bm.splice(idx, 1)
    saveBookmarks(bm)
    return { bookmarked: false }
  }
  bm.unshift({ bookId, chapterId, title, savedAt: Date.now() })
  saveBookmarks(bm.slice(0, 200))
  return { bookmarked: true }
}

export function isBookmarked(bookId: number, chapterId: number) {
  return loadBookmarks().some((b) => b.bookId === bookId && b.chapterId === chapterId)
}

