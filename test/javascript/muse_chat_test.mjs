import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = (await readFile(new URL('../../app/javascript/controllers/muse_chat_controller.js', import.meta.url), 'utf8')).replace(/^import .*\n/, '').replace('export default class', 'return class')
const element = () => ({ innerHTML: 'greeting', value: '', hidden: false, children: [], append(...nodes) { this.children.push(...nodes) }, querySelectorAll() { return [] }, setAttribute() {}, focus() {}, scrollTo() {}, remove() { this.removed = true } })
function harness(fetch) {
  const doc = { createElement: element, addEventListener() {}, removeEventListener() {}, querySelector: () => ({ content: 'csrf' }) }
  const Klass = new Function('Controller', 'document', 'matchMedia', 'fetch', source)(class {}, doc, () => ({ matches: true }), fetch)
  const chat = new Klass()
  for (const key of ['thread', 'input', 'send', 'reset', 'typing', 'error', 'prompts']) chat[`${key}Target`] = element()
  chat.liveValue = true
  chat.urlValue = '/coach'
  chat.connect()
  return chat
}
const event = { preventDefault() {} }
test('successive requests use server-owned context and reset clears local state', async () => {
  const requests = []
  const chat = harness(async (_, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ answer: 'Try a comfortable screen distance.' }) } })
  chat.inputTarget.value = 'I use a laptop'
  await chat.send(event)
  chat.inputTarget.value = 'What next?'
  await chat.send(event)
  assert.equal(requests[1].question, 'What next?')
  assert.equal(requests[1].history, undefined)
  assert.equal(chat.messages.length, 4)
  chat.reset()
  assert.equal(chat.messages.length, 0)
  assert.equal(chat.threadTarget.innerHTML, 'greeting')
})
test('failed request preserves draft without adding unsuccessful history', async () => {
  const chat = harness(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Please retry' }) }))
  chat.inputTarget.value = 'Help with my desk'
  await chat.send(event)
  assert.equal(chat.messages.length, 0)
  assert.equal(chat.inputTarget.value, 'Help with my desk')
  assert.equal(chat.errorTarget.textContent, 'Please retry')
  assert.equal(chat.busy, false)
})
test('reset ignores an obsolete in-flight answer', async () => {
  let release
  const chat = harness(() => new Promise(resolve => { release = resolve }))
  chat.inputTarget.value = 'A question'
  const pending = chat.send(event)
  chat.reset()
  release({ ok: true, json: async () => ({ answer: 'Late answer' }) })
  await pending
  assert.equal(chat.messages.length, 0)
  assert.equal(chat.errorTarget.hidden, true)
})
test('scripted demo uses prior topic without claiming live AI', () => {
  const chat = harness()
  chat.demoReply('Laptop setup')
  assert.match(chat.demoReply('Just the built-in one'), /setup we’re discussing/)
  assert.match(chat.demoReply('My arm is numb'), /healthcare professional/)
})
test('analysis sends explicit intent and ordinary follow-up uses server-owned stage', async () => {
  const requests = []
  const chat = harness(async (_, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ answer: requests.length === 1 ? 'What were you doing?' : 'Try one change.' }) } })
  await chat.analyze(event)
  assert.deepEqual(requests[0], { question: 'Analyze my posture', intent: 'analyze' })
  chat.inputTarget.value = 'Coding on the couch'
  await chat.send(event)
  assert.equal(requests[1].intent, 'chat')
  assert.equal(requests[1].history, undefined)
  assert.equal(chat.messages[1].content, 'What were you doing?')
  assert.equal(chat.messages[3].content, 'Try one change.')
})
test('failed analysis retains intent for retry without scripted fallback', async () => {
  const requests = []
  const chat = harness(async (_, options) => { requests.push(JSON.parse(options.body)); return { ok: false, status: 503, json: async () => ({ error: 'Retry analysis' }) } })
  await chat.analyze(event)
  assert.equal(chat.inputTarget.value, 'Analyze my posture')
  assert.equal(chat.messages.length, 0)
  assert.equal(chat.errorTarget.textContent, 'Retry analysis')
  await chat.send(event)
  assert.equal(requests[1].intent, 'analyze')
  chat.inputTarget.value = 'A different question'
  await chat.send(event)
  assert.equal(requests[2].intent, 'chat')
})
test('analysis is unavailable in demo mode and reset discards pending analysis', async () => {
  let release
  let calls = 0
  const chat = harness(() => { calls++; return new Promise(resolve => { release = resolve }) })
  chat.liveValue = false
  await chat.analyze(event)
  assert.equal(calls, 0)
  chat.liveValue = true
  const pending = chat.analyze(event)
  assert.equal(chat.busy, true)
  chat.reset()
  release({ ok: true, json: async () => ({ answer: 'Late analysis' }) })
  await pending
  assert.equal(chat.messages.length, 0)
  assert.equal(chat.retryIntent, null)
})
