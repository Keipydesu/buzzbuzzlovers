import { Controller } from "@hotwired/stimulus"
import { ConnectionPresence } from "ble/connection_presence"
import { currentSession } from "ble/wearable_session"

export default class extends Controller {
  static targets = ["content"]

  connect() {
    this.active = true
    this.account = document.body.dataset.bblAccount
    this.url = location.href
    this.presence = new ConnectionPresence(this.account, () => {}, { onSaved: () => this.schedule() })
    this.unsubscribe = currentSession(this.account)?.subscribe(type => { if (type === "saved") this.schedule() })
    this.resume = () => { if (!document.hidden) this.schedule() }
    document.addEventListener("visibilitychange", this.resume)
    this.schedule()
  }

  disconnect() {
    this.active = false
    this.unsubscribe?.(); this.presence.close(); this.request?.abort()
    clearTimeout(this.timer)
    document.removeEventListener("visibilitychange", this.resume)
  }

  schedule() {
    if (!this.active) return
    this.dirty = true
    if (this.timer || this.loading || document.hidden) return
    this.timer = setTimeout(() => { this.timer = null; void this.refresh() }, 1000)
  }

  async refresh() {
    if (!this.active || document.body.dataset.bblAccount !== this.account) return
    this.loading = true; this.dirty = false
    this.request = new AbortController()
    const timeout = setTimeout(() => this.request.abort(), 10000)
    try {
      const response = await fetch(this.url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: this.request.signal, headers: { Accept: "text/html" } })
      if (!response.ok) return
      const next = new DOMParser().parseFromString(await response.text(), "text/html")
      if (!this.active || next.body.dataset.bblAccount !== this.account || document.body.dataset.bblAccount !== this.account) return
      for (const current of this.contentTargets) {
        const replacement = next.querySelector(`[data-live-summary-key="${current.dataset.liveSummaryKey}"]`)
        if (!replacement || replacement.innerHTML === current.innerHTML) continue
        current.innerHTML = replacement.innerHTML
      }
    } catch { /* Keep last saved totals; retry on a later save or visibility change. */ }
    finally {
      clearTimeout(timeout); this.loading = false
      if (this.dirty) this.schedule()
    }
  }
}
