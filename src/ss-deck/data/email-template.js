// Email template sent from the CTA slide after a sales conversation.
// The backend send endpoint should call buildEmail() to get the rendered
// subject + body, then hand off to whichever transport (SES, Postmark,
// Gmail API, …) is wired up.

export const EMAIL_SUBJECT = '{{Company Name}} + Yuno'

// Body template. Variables: {{First Name}}, {{Company Name}}, {{Deck Link}},
// {{Sender Name}}. Wording matches the CTA slide messaging; keep them in
// sync if either changes.
export const EMAIL_BODY = `Hi {{First Name}},

Great connecting earlier. Here is a deck we prepared for you:

{{Deck Link}}

Would love to set up 30 minutes to dive deeper into how Yuno could fit {{Company Name}}'s payment stack. Does next Tuesday or Thursday work better for you? I'll send a few time options once you pick a day.

Talk soon,
{{Sender Name}}
`

// Safe template replacement. Supports `{{Foo}}` and `{{Foo Bar}}` (keys
// with spaces). Unknown variables are left as-is so a missing backend-side
// interpolation is visible in the delivered email instead of silently
// shipping an empty string to the merchant.
function interpolate(template, vars) {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  )
}

// First name heuristic: if the recipient didn't type their name in the
// form, fall back to the email's local part ("jane.doe@acme.com" → "Jane"),
// otherwise use a neutral "there".
function firstNameOf({ typedName, email }) {
  const trimmed = (typedName || '').trim()
  if (trimmed) return trimmed.split(/\s+/)[0]
  if (email && email.includes('@')) {
    const local = email.split('@')[0].split(/[._+-]/)[0]
    if (local) return local.charAt(0).toUpperCase() + local.slice(1)
  }
  return 'there'
}

/**
 * Build the full email payload the backend will send.
 *
 * @param {object} p
 * @param {string} p.company         Merchant display name, e.g. "Discord"
 * @param {string} p.toEmail         Merchant's email address
 * @param {string} [p.toName]        Optional full name typed in the form
 * @param {string} p.senderName      Selected Yuno rep's display name
 * @param {string} p.senderEmail     Selected Yuno rep's send-from address
 * @param {string[]} [p.ccEmails]    Addresses always CC'd (backend list)
 * @param {string} [p.deckUrl]       Hosted deck PDF URL (backend sets this)
 */
export function buildEmail({
  company,
  toEmail,
  toName,
  senderName,
  senderEmail,
  ccEmails = [],
  deckUrl = '[deck link]',
}) {
  const vars = {
    'First Name': firstNameOf({ typedName: toName, email: toEmail }),
    'Company Name': company || 'your team',
    'Deck Link': deckUrl,
    'Sender Name': senderName || '',
  }
  return {
    from: senderEmail,
    to: toEmail,
    cc: ccEmails,
    subject: interpolate(EMAIL_SUBJECT, vars),
    body: interpolate(EMAIL_BODY, vars),
  }
}
