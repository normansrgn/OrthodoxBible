import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBookName, loadBible } from '../lib/bible'

export function Bible() {
  const [books, setBooks] = useState<{ BookId: number; Chapters: unknown[] }[] | null>(null)
  const [tab, setTab] = useState<'ot' | 'nt'>('ot')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    loadBible()
      .then((b) => setBooks(b as any))
      .catch((e) => setErr(e?.message || String(e)))
  }, [])

  const filtered = useMemo(() => {
    if (!books) return []
    return books.filter((b) => (tab === 'nt' ? b.BookId >= 40 : b.BookId <= 39))
  }, [books, tab])

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1 className="h1">📖 Священное Писание</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={`btn ${tab === 'ot' ? '' : 'secondary'}`} onClick={() => setTab('ot')}>
            📜 Ветхий Завет
          </button>
          <button className={`btn ${tab === 'nt' ? '' : 'secondary'}`} onClick={() => setTab('nt')}>
            ✝️ Новый Завет
          </button>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid rgba(255,0,0,0.25)', borderRadius: 12 }}>
          <div style={{ color: 'var(--danger)' }}>Ошибка: {err}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Убедитесь, что `web/public/bible.json` существует.
          </div>
        </div>
      )}

      {!books && !err && <div className="muted" style={{ marginTop: 12 }}>Загрузка…</div>}

      <div className="grid two" style={{ marginTop: 14 }}>
        {filtered.map((b) => (
          <div key={b.BookId} className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
            <div className="h2">{getBookName(b.BookId)}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Глав: {Array.isArray((b as any).Chapters) ? (b as any).Chapters.length : '—'}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn" to={`/read/${b.BookId}/1`}>Открыть</Link>
              <Link className="btn secondary" to={`/read/${b.BookId}/${Math.max(1, Math.min(10, (b as any).Chapters?.length || 1))}`}>
                К главам
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

