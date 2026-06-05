export type CalendarDay = {
  title?: string
  saintsHtml?: string
  readings?: { label: string; code: string; url: string }[]
  fastLine?: string | null
  sedmica?: string | null
  glas?: string | null
  oldStyle?: string | null
  ogImage?: string | null
  thoughtHtml?: string
  raw?: any
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function toYMD(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

// Пытаемся взять “presentations.json” как в боте.
export async function fetchAzbykaCalendar(ymd: string): Promise<CalendarDay> {
  // В браузере azbyka.ru часто блокируется CORS, поэтому берём данные с нашего Node API (index.js).
  const res = await fetch(`/api/calendar/${ymd}`)
  if (!res.ok) throw new Error(`calendar api: ${res.status}`)
  const json = await res.json()

  const saints =
    Array.isArray(json?.saints) && json.saints.length
      ? (json.saints as { name: string; url: string }[])
          .map((s) => `• <a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.name)}</a>`)
          .join('<br/>')
      : undefined

  return {
    title: json?.title || undefined,
    saintsHtml: saints,
    readings: Array.isArray(json?.readings) ? json.readings : undefined,
    fastLine: json?.fastLine ?? null,
    sedmica: json?.sedmica ?? null,
    glas: json?.glas ?? null,
    oldStyle: json?.oldStyle ?? null,
    ogImage: json?.ogImage ?? null,
    raw: json,
  }
}

