import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRef, getBookName, loadBible, searchInBible } from '../lib/bible'

export function Search() {
  const [books, setBooks] = useState<any[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    loadBible()
      .then((b) => setBooks(b as any))
      .catch((e) => setErr(e?.message || String(e)))
  }, [])

  const hits = useMemo(() => {
    if (!books) return []
    return searchInBible(books as any, q, 60)
  }, [books, q])

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <h1 className="h1">🔎 Поиск по Библии</h1>
        <div className="muted">Введите минимум 3 символа. Поиск выполняется локально по `bible.json`.</div>

        <input
          className="input"
          placeholder="Например: милость, покаяние, любовь…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {err && <div style={{ color: 'var(--danger)' }}>Ошибка: {err}</div>}

        {q.trim().length >= 3 && (
          <div className="muted" style={{ fontSize: 13 }}>
            Найдено: {hits.length}
          </div>
        )}

        <div className="grid" style={{ marginTop: 6 }}>
          {hits.map((h) => (
            <div key={`${h.bookId}-${h.chapterId}-${h.verseId}`} className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div className="h2">
                  {getBookName(h.bookId)} {h.chapterId}:{h.verseId}
                </div>
                <Link className="btn secondary" to={`/read/${h.bookId}/${h.chapterId}`}>
                  Открыть главу
                </Link>
              </div>
              <div style={{ marginTop: 8, color: 'var(--text-strong)' }}>{h.text}</div>
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                {formatRef(h.bookId, h.chapterId, h.verseId)}
              </div>
            </div>
          ))}

          {q.trim().length >= 3 && hits.length === 0 && (
            <div className="muted">Ничего не найдено. Попробуйте другое слово.</div>
          )}
        </div>
      </div>
    </div>
  )
}

