const storageKey = "bbl-account-context"
export function publishAccount() {
  if (document.documentElement.hasAttribute("data-turbo-preview")) return
  const account = document.body.dataset.bblAccount || ""
  try { localStorage.setItem(storageKey, account) } catch { /* Ownership is still enforced by Rails. */ }
  document.dispatchEvent(new CustomEvent("bbl:account", { detail: account }))
}
export function currentAccount() {
  try { return localStorage.getItem(storageKey) } catch { return null }
}
if (typeof document !== "undefined") {
  document.addEventListener("turbo:load", publishAccount)
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload() })
  window.addEventListener("storage", event => {
    if (event.key === storageKey) document.dispatchEvent(new CustomEvent("bbl:account", { detail: event.newValue }))
  })
}
