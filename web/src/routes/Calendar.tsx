import { useEffect, useMemo, useState } from 'react'
import { addDays, fetchAzbykaCalendar, toYMD } from '../lib/calendar'
import { formatRef, getBookName } from '../lib/bible'
import { resolveReadingText } from '../lib/readings'

export function Calendar() {
  const [date, setDate] = useState(() => {
    const d = new Date()
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<{
    title?: string
    saintsHtml?: string
    readings?: { label: string; code: string; url: string }[]
    fastLine?: string | null
    sedmica?: string | null
    glas?: string | null
    oldStyle?: string | null
    ogImage?: string | null
  } | null>(null)

  const [readingBlocks, setReadingBlocks] = useState<
    { label: string; code: string; url: string; resolved?: { bookId: number; chunks: { chapterId: number; verses: { id: number; text: string }[] }[] } | null }[]
  >([])
  const [readingsLoading, setReadingsLoading] = useState(false)

  const ymd = useMemo(() => {
    // показываем по локальной дате, чтобы было ожидаемо в браузере
    const local = new Date()
    local.setFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    return toYMD(local)
  }, [date])

  useEffect(() => {
    setLoading(true)
    setErr(null)
    fetchAzbykaCalendar(ymd)
      .then((x) => {
        setData({
          title: x.title,
          saintsHtml: x.saintsHtml,
          readings: x.readings,
          fastLine: x.fastLine ?? null,
          sedmica: x.sedmica ?? null,
          glas: x.glas ?? null,
          oldStyle: x.oldStyle ?? null,
          ogImage: x.ogImage ?? null,
        })
      })
      .catch((e) => {
        setErr(e?.message || String(e))
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [ymd])

  const azLink = `https://azbyka.ru/days/${ymd}`

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!data?.readings?.length) {
        setReadingBlocks([])
        setReadingsLoading(false)
        return
      }
      setReadingsLoading(true)
      const blocks = await Promise.all(
        data.readings.slice(0, 12).map(async (r) => ({
          ...r,
          resolved: await resolveReadingText(r.code),
        })),
      )
      if (!cancelled) {
        setReadingBlocks(blocks)
        setReadingsLoading(false)
      }
    }
    run().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [data?.readings])

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <h1 className="h1">📅 Церковный календарь</h1>
        <div className="muted">Чтения и сведения дня берутся с azbyka.ru, а текст чтений — из твоего `bible.json`.</div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn secondary" onClick={() => setDate((d) => addDays(d, -1))}>⬅️ Вчера</button>
          <div className="panel" style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
            <span className="gold">{ymd}</span>
          </div>
          <button className="btn secondary" onClick={() => setDate((d) => addDays(d, 1))}>Завтра ➡️</button>
          <a className="btn" href={azLink} target="_blank" rel="noreferrer">Открыть на azbyka.ru</a>
        </div>

        {loading && <div className="muted">Загрузка…</div>}
        {err && (
          <div className="panel" style={{ padding: 14, border: '1px solid rgba(255,0,0,0.25)', background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ color: 'var(--danger)' }}>Не удалось загрузить календарь в браузере: {err}</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Нажмите «Открыть на azbyka.ru».
            </div>
          </div>
        )}

        {data && (
          <div className="grid">
            {(data.ogImage || data.sedmica || data.fastLine || data.glas || data.oldStyle) && (
              <div className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
                <div className="h2">{data.title || 'День'}</div>
                {data.ogImage && (
                  <img
                    src={data.ogImage}
                    alt=""
                    style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 12, marginTop: 10, border: '1px solid rgba(255,255,255,0.12)' }}
                    loading="lazy"
                  />
                )}
                <div className="muted" style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {data.oldStyle && <div><span className="gold">🗓</span> {data.oldStyle}</div>}
                  {data.sedmica && <div><span className="gold">⛪</span> {data.sedmica}</div>}
                  {data.fastLine && <div><span className="gold">🥗</span> {data.fastLine}</div>}
                  {data.glas && <div><span className="gold">🔔</span> {data.glas}</div>}
                </div>
              </div>
            )}

            <div className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div className="muted" style={{ marginTop: 8 }}>
                <span className="gold">☦</span> Память святых
              </div>
              {data.saintsHtml ? (
                <div style={{ marginTop: 8, color: 'var(--text-strong)' }} dangerouslySetInnerHTML={{ __html: data.saintsHtml }} />
              ) : (
                <div className="muted" style={{ marginTop: 8 }}>—</div>
              )}
            </div>

            <div className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div className="muted">
                <span className="gold">📖</span> Чтения дня
              </div>
              {readingsLoading ? (
                <div className="muted" style={{ marginTop: 8 }}>Загрузка чтений…</div>
              ) : readingBlocks.length === 0 ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  Чтения не найдены для этой даты. Откройте на azbyka.ru.
                </div>
              ) : (
                <div className="grid" style={{ marginTop: 10 }}>
                  {readingBlocks.map((r) => (
                    <div key={r.code} className="panel" style={{ padding: 12, background: 'rgba(0,0,0,0.18)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div className="h2" style={{ fontSize: 16 }}>{r.label}</div>
                        <a className="btn secondary" href={r.url} target="_blank" rel="noreferrer">На azbyka.ru</a>
                      </div>

                      {!r.resolved ? (
                        <div className="muted" style={{ marginTop: 8 }}>
                          Не удалось сопоставить чтение с `bible.json`: <span className="gold">{r.code}</span>
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {getBookName(r.resolved.bookId)}
                          </div>
                          {r.resolved.chunks.map((ch) => (
                            <div key={ch.chapterId} style={{ display: 'grid', gap: 8 }}>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {formatRef(r.resolved!.bookId, ch.chapterId)}
                              </div>
                              {ch.verses.map((v) => (
                                <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 12 }}>
                                  <div style={{ color: 'var(--gold)', fontFamily: 'var(--serif)', textAlign: 'right' }}>{v.id}</div>
                                  <div style={{ color: 'var(--text-strong)' }}>{v.text}</div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

