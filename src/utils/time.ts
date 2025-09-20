// Returns a datetime-local string in EST suitable for <input type="datetime-local">
export function toESTLocalISO(d: Date) {
  // get EST time components by shifting the date to EST
  const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const yyyy = est.getFullYear()
  const mm = String(est.getMonth() + 1).padStart(2, '0')
  const dd = String(est.getDate()).padStart(2, '0')
  const hh = String(est.getHours()).padStart(2, '0')
  const min = String(est.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}
