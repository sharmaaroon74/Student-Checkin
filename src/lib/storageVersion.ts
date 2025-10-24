const STORAGE_VERSION = 'v5'  // bump when you change client storage shape

export function enforceStorageVersion() {
  const key = 'sunnydays.storage.version'
  try {
    const current = localStorage.getItem(key)
    if (current === STORAGE_VERSION) return
    // Clear only our app’s keys (safe; does NOT touch browser-wide cookies/history)
    Object.keys(localStorage)
      .filter(k => k.startsWith('sunnydays.') || k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
    localStorage.setItem(key, STORAGE_VERSION)
  } catch {
    // ignore
  }
}
