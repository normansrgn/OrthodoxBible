import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBookName } from '../lib/bible'
import { loadBookmarks, saveBookmarks } from '../lib/bookmarks'

export function Bookmarks() {
  const [ver, setVer] = useState(0)
  const bookmarks = useMemo(() => loadBookmarks(), [ver])

  function removeAt(idx: number) {
    const next = bookmarks.slice()
    next.splice(idx, 1)
    saveBookmarks(next)
    setVer((v) => v + 1)
  }

  function clearAll() {
    saveBookmarks([])
    setVer((v) => v + 1)
  }

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <h1 className="h1">🔖 Закладки</h1>
        <button className="btn secondary" onClick={clearAll} disabled={bookmarks.length === 0} style={bookmarks.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
          Очистить
        </button>
      </div>

      {bookmarks.length === 0 ? (
        <div className="muted" style={{ marginTop: 12 }}>
          Закладок пока нет. Откройте главу и нажмите «Добавить».
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 12 }}>
          {bookmarks.map((b, idx) => (
            <div key={`${b.bookId}-${b.chapterId}-${b.savedAt}`} className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div className="h2">{b.title || `${getBookName(b.bookId)} ${b.chapterId}`}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {new Date(b.savedAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link className="btn" to={`/read/${b.bookId}/${b.chapterId}`}>Открыть</Link>
                  <button className="btn secondary" onClick={() => removeAt(idx)}>Удалить</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

