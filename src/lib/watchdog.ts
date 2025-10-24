function safeResetAppStorage() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('sunnydays.') || k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
  } catch {}
}

export function startBootstrapWatchdog() {
  // After first paint, ensure header + logout exist
  setTimeout(() => {
    const header = document.querySelector('[data-app-header]')
    const logoutBtn = document.querySelector('[data-logout-btn]')
    if (!header || !logoutBtn) {
      safeResetAppStorage()
      window.location.reload()
    }
  }, 0)
}
