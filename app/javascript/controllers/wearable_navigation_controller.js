import { Controller } from "@hotwired/stimulus"
import { ConnectionPresence } from "ble/connection_presence"
import { currentSession } from "ble/wearable_session"

export default class extends Controller {
  static targets = ["connectCard", "headerLink", "sessionNotice", "header", "connectionStatus", "postureNotice"]

  connect() {
    this.presence = new ConnectionPresence(document.body.dataset.bblAccount, connected => {
      this.presenceConnected = connected
      this.renderSession()
    })
    this.session = currentSession(document.body.dataset.bblAccount)
    this.unsubscribe = this.session?.subscribe(() => this.renderSession())
    this.renderSession()
    this.checkPresence = () => this.presence.check()
    this.timer = setInterval(this.checkPresence, 5000)
    this.postureTimer = setInterval(() => this.renderSession(), 50)
    document.addEventListener("visibilitychange", this.checkPresence)
  }

  disconnect() {
    this.unsubscribe?.()
    clearInterval(this.timer)
    clearInterval(this.postureTimer)
    document.removeEventListener("visibilitychange", this.checkPresence)
    this.presence.close()
  }

  renderSession() {
    if (!this.hasSessionNoticeTarget) return
    const session = this.session
    const attention = session?.savingState?.needsAttention || session?.capacityError
    const connected = Boolean(this.presenceConnected || (session?.active && session.link === "connected"))
    const fresh = session?.active && session.link === "connected" && !session.accountChanged && session.lastFresh !== null && performance.now() - session.lastFresh <= 3000
    let warning = { opacity: 0 }
    if (fresh) {
      const timing = session.warning.reading
      if (!timing) warning.opacity = session.lastReading?.state === "slouching" ? 1 : 0
      else if (timing.session === session.lastReading?.session_id && ["upright", "slouching"].includes(session.lastReading?.state)) {
        warning = session.warning.display(performance.now())
      }
    }
    const notice = this.postureNoticeTarget
    notice.hidden = warning.opacity <= 0
    notice.style.opacity = warning.opacity
    if (warning.shake && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      notice.animate([
        { transform: "translateX(-50%)" }, { transform: "translateX(calc(-50% - 4px))" },
        { transform: "translateX(calc(-50% + 4px))" }, { transform: "translateX(calc(-50% - 2px))" },
        { transform: "translateX(-50%)" }
      ], { duration: 360, easing: "ease-out" })
    }
    for (const card of this.connectCardTargets) card.hidden = connected
    for (const link of this.headerLinkTargets) link.hidden = connected
    this.headerTarget.classList.toggle("wearable-connected", connected)
    const text = connected ? "Wearable connected" : "Wearable disconnected"
    if (this.connectionStatusTarget.textContent !== text) this.connectionStatusTarget.textContent = text
    this.sessionNoticeTarget.hidden = this.element.dataset.controller.split(" ").includes("device") || !attention
  }
}
