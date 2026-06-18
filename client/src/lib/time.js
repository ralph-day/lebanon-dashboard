// ── Single source of truth for rendering server timestamps in Beirut time ──────
//
// The server sends timestamps in two shapes:
//   1. NAIVE Beirut wall-clock (no zone), e.g. "2026-06-18T10:56:00" — from toISO()
//      on ExcelJS Date cells (their UTC fields already hold Beirut-local digits).
//   2. REAL UTC instants (with Z or offset), e.g. "2026-06-18T07:56:00.000Z" —
//      from toInstantISO() / timezoned date strings.
//
// These helpers detect which shape it is and always render the correct Beirut
// wall-clock, independent of the viewer's machine timezone or browser quirks
// (Safari parses naive datetimes as UTC, which used to add a phantom +3h).

const BEIRUT_OFFSET_MS = 3 * 3600000 // Lebanon = UTC+3 (no DST in this dataset)

function hasZone(iso) {
  return /[zZ]$|[+-]\d\d:?\d\d$/.test(iso)
}

// Real epoch ms for a server timestamp, regardless of shape.
export function toRealMs(iso) {
  if (!iso) return NaN
  if (hasZone(iso)) return Date.parse(iso)            // already a real instant
  return Date.parse(iso + 'Z') - BEIRUT_OFFSET_MS     // naive Beirut digits → real UTC
}

const DEFAULT_FMT = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }

// Format a server timestamp as Beirut wall-clock, viewer-timezone-independent.
export function fmtBeirut(iso, opts = DEFAULT_FMT) {
  if (!iso) return '—'
  if (hasZone(iso)) {
    const d = new Date(iso)
    return isNaN(d) ? '—' : d.toLocaleString('en-GB', { timeZone: 'Asia/Beirut', ...opts })
  }
  // Naive Beirut digits — render exactly as stored (parse + format as UTC so no
  // local offset is ever applied).
  const d = new Date(iso + 'Z')
  return isNaN(d) ? '—' : d.toLocaleString('en-GB', { timeZone: 'UTC', ...opts })
}

// Relative "x ago" from a server timestamp (never negative / future).
export function timeAgoBeirut(iso) {
  const ms = toRealMs(iso)
  if (isNaN(ms)) return '—'
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000))
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
  return `${Math.floor(mins / 1440)}d ago`
}

// Beirut calendar date (YYYY-MM-DD) for grouping/filtering by day.
export function beirutDate(iso) {
  const ms = toRealMs(iso)
  if (isNaN(ms)) return null
  return new Date(ms + BEIRUT_OFFSET_MS).toISOString().slice(0, 10)
}
