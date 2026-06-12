// Interpolation smoke test for the sales follow-up email.
// Run with: node src/data/email-template.test.mjs

import { strict as assert } from 'node:assert'
import { buildEmail, EMAIL_SUBJECT, EMAIL_BODY } from './email-template.js'

const failures = []
function check(label, fn) {
  try {
    fn()
    console.log(`  ok  ${label}`)
  } catch (err) {
    failures.push({ label, err })
    console.log(`  FAIL ${label}`)
    console.log(`       ${err.message}`)
  }
}

console.log('email-template interpolation checks\n')

// 1. Template text itself is what the user asked for
check('subject template is "{{Company Name}} + Yuno"', () => {
  assert.equal(EMAIL_SUBJECT, '{{Company Name}} + Yuno')
})

check('body template opens with "Hi {{First Name}}," greeting', () => {
  assert.ok(EMAIL_BODY.startsWith('Hi {{First Name}},'))
})

check('body template closes with "{{Sender Name}}"', () => {
  assert.ok(EMAIL_BODY.trim().endsWith('{{Sender Name}}'))
})

// 2. Typed-name + full payload
const full = buildEmail({
  company: 'Discord',
  toEmail: 'jane.doe@discord.com',
  toName: 'Jane Doe',
  senderName: 'Germán Tatis',
  senderEmail: 'german.tatis@y.uno',
  ccEmails: ['justo@y.uno', 'samuel@y.uno'],
  deckUrl: 'https://deck.y.uno/discord.pdf',
})

check('subject interpolates company name', () => {
  assert.equal(full.subject, 'Discord + Yuno')
})

check('body greets with typed first name', () => {
  assert.ok(full.body.startsWith('Hi Jane,\n'))
})

check('body signs off with sender name', () => {
  assert.ok(full.body.includes('\nTalk soon,\nGermán Tatis\n'))
})

check('body mentions deck URL', () => {
  assert.ok(full.body.includes('https://deck.y.uno/discord.pdf'))
})

check("body references company's payment stack", () => {
  assert.ok(full.body.includes("Discord's payment stack"))
})

check('to/from/cc routing carried through', () => {
  assert.equal(full.from, 'german.tatis@y.uno')
  assert.equal(full.to, 'jane.doe@discord.com')
  assert.deepEqual(full.cc, ['justo@y.uno', 'samuel@y.uno'])
})

// 3. Fallback behavior when the merchant leaves the name blank
const derived = buildEmail({
  company: 'Acme',
  toEmail: 'priya@acme.com',
  senderName: 'Daniela Reyes',
  senderEmail: 'daniela.reyes@y.uno',
})

check('first name falls back to capitalized email local-part', () => {
  assert.ok(derived.body.startsWith('Hi Priya,\n'), `got: ${derived.body.slice(0, 40)}`)
})

check('dotted email local-part uses just the first segment', () => {
  const d = buildEmail({
    company: 'Acme',
    toEmail: 'jane.doe@acme.com',
    senderName: 'X',
    senderEmail: 'x@y.uno',
  })
  assert.ok(d.body.startsWith('Hi Jane,\n'))
})

// 4. Fully empty → neutral greeting
const neutral = buildEmail({
  company: 'Acme',
  toEmail: '',
  senderName: 'X',
  senderEmail: 'x@y.uno',
})

check('empty recipient falls back to "Hi there,"', () => {
  assert.ok(neutral.body.startsWith('Hi there,\n'))
})

// 5. No unrendered placeholders when everything is provided
check('no {{...}} placeholders remain in rendered subject+body', () => {
  const remaining = (full.subject + full.body).match(/\{\{[^}]+\}\}/g)
  assert.equal(remaining, null, `unrendered: ${JSON.stringify(remaining)}`)
})

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('All checks passed.')
