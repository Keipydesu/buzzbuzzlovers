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
  }

  toggle() {
    const theme = this.element.dataset.theme === "dark" ? "light" : "dark"
    this.apply(theme)
    try { localStorage.setItem("bbl-theme", theme) } catch (_) { /* Optional persistence. */ }
  }

  apply(theme) {
    this.element.dataset.theme = theme
    this.buttonTarget.textContent = theme === "dark" ? "☀ Light mode" : "☾ Dark mode"
    this.buttonTarget.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`)
  }
}
