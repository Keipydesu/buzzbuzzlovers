import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["thread", "input", "send", "reset", "typing", "error", "prompts"]
  static values = { live: Boolean, url: String }

  connect() {
    this.messages = []
    this.busy = false
    this.greeting = this.threadTarget.querySelector?.("[data-muse-greeting]")?.outerHTML || this.threadTarget.innerHTML
    this.clearBeforeCache = () => this.reset()
    document.addEventListener("turbo:before-cache", this.clearBeforeCache)
  }

  disconnect() {
    this.abort?.abort()
    this.abort = null
    clearTimeout(this.delay)
    document.removeEventListener("turbo:before-cache", this.clearBeforeCache)
  }

  async reset(event) {
    this.abort?.abort()
    this.abort = null
    clearTimeout(this.delay)
    this.messages = []
    this.topic = null
    this.threadTarget.innerHTML = this.greeting
    this.inputTarget.value = ""
    this.errorTarget.hidden = true
    this.promptsTarget.hidden = false
    this.setBusy(false)
    if (event && this.liveValue) {
      this.setBusy(true)
      try {
        const response = await fetch(this.urlValue, { method: "DELETE", headers: { "Accept": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content } })
        if (!response.ok || response.redirected) throw Error("Could not clear the live conversation. Please sign in and retry New chat.")
      } catch (error) {
        this.errorTarget.textContent = error.message
        this.errorTarget.hidden = false
      } finally { this.setBusy(false) }
    }
  }

  suggest(event) {
    this.inputTarget.value = event.currentTarget.textContent.trim()
    this.inputTarget.focus()
    this.send(event)
  }

  keydown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !matchMedia("(pointer: coarse)").matches) {
      event.preventDefault()
      this.send(event)
    }
  }

  append(role, text) {
    const bubble = document.createElement("article")
    bubble.className = `muse-bubble ${role === "user" ? "muse-bubble-user" : ""}`
    const label = document.createElement("span")
    label.className = "muse-speaker"
    label.textContent = role === "user" ? "You" : this.liveValue ? "Muse" : "Muse demo"
    const content = document.createElement("p")
    content.textContent = text
    bubble.append(label, content)
    this.threadTarget.append(bubble)
    this.threadTarget.scrollTo({ top: this.threadTarget.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
    return bubble
  }

  setBusy(value) {
    this.busy = value
    this.sendTarget.disabled = value
    this.inputTarget.disabled = value
    this.typingTarget.hidden = !value
    this.threadTarget.setAttribute("aria-busy", String(value))
    this.promptsTarget.querySelectorAll("button").forEach(button => { button.disabled = value })
  }

  async send(event) {
    event.preventDefault()
    const question = this.inputTarget.value.trim()
    if (this.busy || !question || question.length > 2000) return
    const bubble = this.append("user", question)
    this.inputTarget.value = ""
    this.errorTarget.hidden = true
    this.promptsTarget.hidden = true
    this.setBusy(true)
    const request = new AbortController()
    this.abort = request
    try {
      let answer
      if (this.liveValue) {
        const timeout = setTimeout(() => request.abort(), 45000)
        try {
          const response = await fetch(this.urlValue, {
            method: "POST", signal: request.signal,
            headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content },
            body: JSON.stringify({ question })
          })
          if (response.redirected) throw Error("Please sign in again, then retry your message.")
          if (response.status === 429) throw Error("A little pause: please wait a minute before sending again.")
          const payload = await response.json()
          if (!response.ok) throw Error(payload.error || "Muse is unavailable. Please try again.")
          if (typeof payload.answer !== "string" || !payload.answer.trim()) throw Error("Muse returned an empty reply. Please try again.")
          answer = payload.answer
        } finally { clearTimeout(timeout) }
      } else {
        await new Promise(resolve => { this.delay = setTimeout(resolve, 650) })
        answer = this.demoReply(question)
      }
      if (this.abort !== request) return
      this.messages.push({ role: "user", content: question }, { role: "assistant", content: answer })
      this.messages = this.messages.slice(-12)
      this.append("assistant", answer)
    } catch (error) {
      if (this.abort !== request) return
      bubble.remove()
      this.inputTarget.value = question
      this.errorTarget.textContent = error.name === "AbortError" ? "That reply took too long. Your message is ready to retry." : error.message
      this.errorTarget.hidden = false
    } finally {
      if (this.abort === request) {
        this.setBusy(false)
        this.inputTarget.focus({ preventScroll: true })
      }
    }
  }

  demoReply(question) {
    const text = question.toLowerCase()
    if (/pain|numb|weakness|tingl|hurt/.test(text)) return "A posture reading can’t tell us what is causing those symptoms. If they persist or worsen, speak with a healthcare professional rather than pushing through. For now, choose a comfortable position and avoid forcing a stretch. Is there a particular task or position that feels uncomfortable?"
    if (/laptop|screen|monitor|keyboard|desk/.test(text)) {
      this.topic = "setup"
      return "Let’s start with your setup. Can you read the screen comfortably without leaning forward? Keep your back and feet supported. If you raise a laptop, a separate keyboard and mouse let your arms stay comfortable. Are you using the laptop on its own or with a separate keyboard?"
    }
    if (/break|habit|movement|remind|study|coding/.test(text)) {
      this.topic = "habit"
      return "Try tying a brief change of position or a short walk to something you already do, like finishing a task. The aim is variety, not staying rigidly upright. What natural pause could work in your study routine?"
    }
    if (/slouch|posture|back|neck|stiff/.test(text)) {
      this.topic = "posture"
      return "Slouching sometimes is normal. Long stretches in one position can feel uncomfortable, but a slouch count doesn’t prove damage. Notice what you’re doing when you lean forward. Does it happen while reading, typing, or using your phone?"
    }
    if (/thank|great|helpful/.test(text)) return "You’re welcome. Start with one comfortable adjustment and notice how it feels. You can keep asking about your setup or movement habits. This is still a scripted demo, so a live Muse connection is needed for personalized follow-ups."
    if (this.topic === "setup") return "For the setup we’re discussing, try one change: adjust text size or screen distance until you can read without leaning in. Keep the keyboard within comfortable reach. What feels different after that change?"
    if (this.topic === "habit") return "Use that pause as your cue: shift position or get up briefly if comfortable, then return to your task. Keep it easy enough to repeat. Would a reminder between tasks fit your routine?"
    if (this.topic === "posture") return "For that activity, experiment with a comfortable supported position and change it when you feel stiff. You don’t need to hold a perfect pose. Would you like to look at your desk setup or build a movement habit?"
    return "I can demonstrate a check-in about slouching, laptop setup, or movement breaks. Tell me which one you’d like to explore. My replies here are preset examples; live Muse is not connected yet."
  }
}
