const timeFormat = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric' })

export const formatTime = (value: number | string | Date) => timeFormat.format(new Date(value))
export const formatDate = (value: number | string | Date) => dateFormat.format(new Date(value))

/** "5分前" / "2時間前" — for sensor events and notifications. */
export function formatRelative(value: number | string | Date, now = Date.now()) {
  const diff = now - new Date(value).getTime()
  if (diff < 60_000) return 'たった今'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  return days === 1 ? '昨日' : `${days}日前`
}

/** 今日 / 昨日 / 明日 / a date — used by the history list and by 予約, which is always future. */
export function dayLabel(value: number | string | Date, now = Date.now()) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = (day(new Date(now)) - day(new Date(value))) / 86_400_000
  if (diff === 0) return '今日'
  if (diff === 1) return '昨日'
  if (diff === -1) return '明日'
  return formatDate(value)
}

export const formatSeconds = (ms: number) => `${Math.max(1, Math.ceil(ms / 1000))}秒`
