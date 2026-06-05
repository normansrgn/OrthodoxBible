import { Link } from 'react-router-dom'

const PSALMS_CATEGORIES: { name: string; psalms: number[] }[] = [
  { name: 'Благодарение', psalms: [33, 65, 102, 117, 145, 149] },
  { name: 'В скорби и унынии', psalms: [26, 36, 39, 41, 56, 101] },
  { name: 'О защите от врагов', psalms: [3, 26, 34, 58, 90, 142] },
  { name: 'Покаянные', psalms: [31, 37, 50, 87, 142] },
  { name: 'В болезнях', psalms: [6, 29, 36, 40, 102] },
  { name: 'О семье', psalms: [126, 127] },
  { name: 'В нуждах житейских', psalms: [36, 51, 62, 111] },
  { name: 'О мире душевном', psalms: [22, 26, 36, 61] },
]

export function Psalter() {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <h1 className="h1">📜 Псалтирь на всякую потребу</h1>
        <div className="muted">
          Выберите нужный раздел — откроется соответствующий псалом (книга Псалтирь, глава = номер псалма).
        </div>

        <div className="grid two" style={{ marginTop: 10 }}>
          {PSALMS_CATEGORIES.map((c) => (
            <div key={c.name} className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div className="h2">{c.name}</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {c.psalms.map((p) => (
                  <Link key={p} className="btn secondary" to={`/read/19/${p}`}>
                    Пс. {p}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

