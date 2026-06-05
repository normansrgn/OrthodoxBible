import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <h1 className="h1">
          <span className="gold">☦</span> Слово Божие рядом
        </h1>
        <div className="muted">
          Откройте чтение Священного Писания, найдите стих по слову, сохраните место в закладки и смотрите церковный календарь.
        </div>

        <div className="grid two" style={{ marginTop: 10 }}>
          <Link className="btn" to="/bible">📖 Читать Библию</Link>
          <Link className="btn secondary" to="/search">🔎 Поиск по стихам</Link>
          <Link className="btn secondary" to="/random">🎲 Случайный стих</Link>
          <Link className="btn secondary" to="/calendar">📅 Календарь дня</Link>
        </div>

        <div style={{ marginTop: 10, fontSize: 13 }} className="muted">
          Подсказка: эту страницу удобно открывать по ссылке из Telegram-бота.
        </div>
      </div>
    </div>
  )
}

