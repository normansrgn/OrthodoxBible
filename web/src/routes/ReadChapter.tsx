import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { findBook, findChapter, formatRef, getBookName, loadBible } from '../lib/bible'
import { isBookmarked, toggleBookmark } from '../lib/bookmarks'

export function ReadChapter() {
  const params = useParams()
  const navigate = useNavigate()
  const bookId = Number(params.bookId)
  const chapterId = Number(params.chapterId)

  const [books, setBooks] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [bookmarked, setBookmarked] = useState(false)

  useEffect(() => {
    setBookmarked(isBookmarked(bookId, chapterId))
  }, [bookId, chapterId])

  useEffect(() => {
    loadBible()
      .then((b) => setBooks(b as any))
      .catch((e) => setErr(e?.message || String(e)))
  }, [])

  const book = useMemo(() => (books ? findBook(books as any, bookId) : undefined), [books, bookId])
  const chapter = useMemo(() => findChapter(book as any, chapterId), [book, chapterId])

  const chapterCount = (book as any)?.Chapters?.length || 0
  const prev = chapterId > 1 ? chapterId - 1 : null
  const next = chapterCount && chapterId < chapterCount ? chapterId + 1 : null

  function onToggleBookmark() {
    const title = `${getBookName(bookId)} ${chapterId}`
    const r = toggleBookmark(bookId, chapterId, title)
    setBookmarked(r.bookmarked)
  }

  if (err) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        <div style={{ color: 'var(--danger)' }}>Ошибка: {err}</div>
      </div>
    )
  }

  if (!books || !book || !chapter) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        <div className="muted">Загрузка…</div>
      </div>
    )
  }

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div className="h1" style={{ fontSize: 34 }}>
              {getBookName(bookId)} <span className="gold">·</span> глава {chapterId}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {formatRef(bookId, chapterId)} · ссылка страницы сохраняется (можно отправить из бота)
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`btn ${bookmarked ? '' : 'secondary'}`} onClick={onToggleBookmark}>
              {bookmarked ? '🔖 В закладках' : '🔖 Добавить'}
            </button>
            <Link className="btn secondary" to="/bible">К книгам</Link>
          </div>
        </div>

        <div className="panel" style={{ padding: 12, background: 'rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {prev ? (
                <Link className="btn secondary" to={`/read/${bookId}/${prev}`}>⬅️ Пред.</Link>
              ) : (
                <button className="btn secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>⬅️ Пред.</button>
              )}
              {next ? (
                <Link className="btn secondary" to={`/read/${bookId}/${next}`}>След. ➡️</Link>
              ) : (
                <button className="btn secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>След. ➡️</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13 }}>Глава:</span>
              <select
                className="input"
                style={{ width: 120, padding: '9px 10px' }}
                value={chapterId}
                onChange={(e) => navigate(`/read/${bookId}/${Number(e.target.value)}`)}
              >
                {Array.from({ length: chapterCount }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <article className="panel" style={{ padding: 16, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {(chapter as any).Verses.map((v: any) => (
              <div key={v.VerseId} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 12 }}>
                <div style={{ color: 'var(--gold)', fontFamily: 'var(--serif)', textAlign: 'right' }}>{v.VerseId}</div>
                <div style={{ color: 'var(--text-strong)' }}>{v.Text}</div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

