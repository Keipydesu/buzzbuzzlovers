import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["button"]

  connect() {
    let theme = "dark"
    try {
      const saved = localStorage.getItem("bbl-theme")
      if (["light", "dark"].includes(saved)) theme = saved
    } catch (_) { /* The toggle still works when storage is unavailable. */ }
    this.apply(theme)
    this.updateBackground = () => {
      if (this.backgroundFrame) return
      this.backgroundFrame = requestAnimationFrame(() => {
        // Offset most of the content scroll so the background drifts at 10% speed.
        const offset = Math.max(window.scrollY, 0) * 0.9
        this.element.style.setProperty("--background-offset", `${offset}px`)
        this.backgroundFrame = null
      })
    }
    window.addEventListener("scroll", this.updateBackground, { passive: true })
    window.addEventListener("resize", this.updateBackground)
    this.updateBackground()
  }

  disconnect() {
    window.removeEventListener("scroll", this.updateBackground)
    window.removeEventListener("resize", this.updateBackground)
    cancelAnimationFrame(this.backgroundFrame)
  }

  toggle() {
    const theme = this.element.dataset.theme === "dark" ? "light" : "dark"
    this.apply(theme)
    try { localStorage.setItem("bbl-theme", theme) } catch (_) { /* Optional persistence. */ }
  }

  apply(theme) {
    this.element.dataset.theme = theme
    const compact = this.buttonTarget.dataset.iconOnly === "true"
    this.buttonTarget.textContent = theme === "dark" ? (compact ? "☀" : "☀ Light mode") : (compact ? "☾" : "☾ Dark mode")
    this.buttonTarget.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`)
  }
}
