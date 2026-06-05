import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRef, getBookName, loadBible, pickRandomVerse } from '../lib/bible'

export function RandomVerse() {
  const [state, setState] = useState<{ ref: string; text: string; bookId: number; chapterId: number; verseId: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function roll() {
    try {
      const books = await loadBible()
      const { book, chapter, verse } = pickRandomVerse(books)
      setState({
        ref: `${getBookName(book.BookId)} ${chapter.ChapterId}:${verse.VerseId}`,
        text: verse.Text,
        bookId: book.BookId,
        chapterId: chapter.ChapterId,
        verseId: verse.VerseId,
      })
    } catch (e: any) {
      setErr(e?.message || String(e))
    }
  }

  useEffect(() => {
    roll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <h1 className="h1">🎲 Случайный стих</h1>
        <div className="muted">Для небольшого чтения и размышления.</div>

        {err && <div style={{ color: 'var(--danger)' }}>Ошибка: {err}</div>}

        {state && (
          <div className="panel" style={{ padding: 16, background: 'rgba(255,255,255,0.03)' }}>
            <div className="h2">{state.ref}</div>
            <div style={{ marginTop: 10, color: 'var(--text-strong)', fontFamily: 'var(--serif)', fontSize: 18 }}>
              {state.text}
            </div>
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              {formatRef(state.bookId, state.chapterId, state.verseId)}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={roll}>Ещё раз</button>
              <Link className="btn secondary" to={`/read/${state.bookId}/${state.chapterId}`}>Открыть главу</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

