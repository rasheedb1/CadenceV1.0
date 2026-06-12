// AI-Tells Module — research-backed list of patterns that pattern-match as
// "AI-generated" to sophisticated B2B buyers (2025-2026).
// Sources: Wikipedia "Signs of AI Writing", Walter Writes 2025, Lavender,
// Becc Holland "49 words to avoid", AiSDR, Originality.AI.
// =============================================================================

// ─── Typography (non-natural symbols) ────────────────────────────────────────
export const AI_TELL_TYPOGRAPHY: Record<string, RegExp> = {
  em_dash: /—/g,
  en_dash_in_text: /[a-z]–[a-z]/gi,
  tilde_anywhere: /~/g,  // V17: ANY tilde is banned (was only matching ~+digit)
  curly_quote_left: /[‘“]/g,
  curly_quote_right: /[’”]/g,
  bullet_char: /•/g,
  ellipsis_unicode: /…/g,
  non_breaking_space: / /g,
}

// ─── Vocabulary (LLM-favored words) ──────────────────────────────────────────
export const AI_TELL_VOCABULARY = [
  'delve', 'tapestry', 'landscape', 'realm', 'testament', 'underscore',
  'underpinnings', 'pivotal', 'foster', 'robust', 'garner', 'bolster',
  'intricate', 'intricacies', 'interplay', 'meticulous', 'vibrant', 'showcase',
  'commendable', 'strategically',
  'leverage', 'synergy', 'streamline', 'unlock', 'transform', 'revolutionize',
  'revolutionary', 'game-changer', 'best-in-class', 'innovative', 'paradigm',
  'cutting-edge', 'holistic', 'disruptive', 'scalable', 'opportunity',
  // V17 additions — formal/uncommon vocabulary user flagged 2026-05-11
  // ("incumbent" specifically — anything that doesn't sound like normal
  // conversational English a payments AE would actually say to a peer):
  'incumbent', 'ostensibly', 'paramount', 'salient', 'pertinent',
  'henceforth', 'expedite', 'facilitate', 'juncture', 'endeavor',
  'commensurate', 'aforementioned', 'notwithstanding', 'subsequent',
  'purport', 'hereby', 'whereby', 'wherein', 'albeit', 'thereby',
  'heretofore', 'hitherto', 'erstwhile', 'moreover',
  'utilize', 'commence', 'terminate', 'ascertain', 'elucidate',
  'orchestrating', 'facilitating',
] as const

// ─── Structural patterns (LLM tics) ──────────────────────────────────────────
export const AI_TELL_STRUCTURAL: Record<string, RegExp> = {
  copula_avoidance: /\b(serves?\s+as|stands?\s+as|represents?|marks?|boasts?)\s+(?:a|an|the)\s+/gi,
  negative_parallelism: /\bnot\s+(?:just|only)\s+\w+(?:\s+\w+){0,4}[,.]?\s+but\s+(?:also|rather)\s+/gi,
  in_todays_opener: /\bin\s+today'?s\s+(?:fast-paced|complex|competitive|dynamic|evolving|digital|modern)\s+\w+/gi,
  vague_attribution: /\b(industry\s+reports?|experts?|observers?|analysts?)\s+(suggest|argue|note|indicate)/gi,
  participle_drift: /,\s+(?:enabling|driving|fostering|empowering|delivering|providing)\s+\w+/gi,
  despite_challenges: /despite\s+its\s+\w+,?\s+faces?\s+(several|numerous|various)\s+challenges/gi,
  pixel_precision: /[+\-]?\d+\.\d+\s*(pp|bps|%|M|K)\b/g,
  clinical_parenthetical: /\([a-z][a-z\s\-,]+,\s+different\s+\w+\s+\w+\)/gi,
}

// ─── Cliché openers ──────────────────────────────────────────────────────────
export const AI_TELL_OPENERS: RegExp[] = [
  /\bhope\s+(this\s+(email\s+)?finds?|your|you'?re|all\s+is|things\s+are|the\s+week|your\s+week|your\s+day)/i,
  /\bhope\s+(?:you|this)\s+(?:is|are|get)/i,
  /\bi('m|\s+am)\s+reaching\s+out/i,
  /\bi\s+wanted\s+to\s+reach\s+out/i,
  /\bsaw\s+your\s+\w+/i,
  /\bcongrats?\s+on\s+/i,
  /\bnoticed\s+your\s+(hire|funding|launch|round|move)/i,
  /\bjust\s+checking\s+in/i,
  /\bfollowing\s+up\b/i,
  /\bquick\s+question[:.]?\s*$/im,
  /\bcircle\s+back/i,
  /\bi'?d\s+(?:like|love)\s+to\s+(introduce|connect)/i,
  /\blooking\s+forward\s+to\s+(it|hearing|connecting|chatting)/i,
]

export interface AiTellViolation {
  category: 'typography' | 'vocabulary' | 'structural' | 'opener'
  pattern: string
  match: string
  position: number
}

export function detectAiTells(text: string): AiTellViolation[] {
  const violations: AiTellViolation[] = []

  for (const [name, regex] of Object.entries(AI_TELL_TYPOGRAPHY)) {
    for (const m of text.matchAll(regex)) {
      violations.push({ category: 'typography', pattern: name, match: m[0], position: m.index ?? 0 })
    }
  }

  for (const word of AI_TELL_VOCABULARY) {
    const wre = new RegExp(`\\b${word}\\b`, 'gi')
    for (const m of text.matchAll(wre)) {
      violations.push({ category: 'vocabulary', pattern: word, match: m[0], position: m.index ?? 0 })
    }
  }

  for (const [name, regex] of Object.entries(AI_TELL_STRUCTURAL)) {
    for (const m of text.matchAll(regex)) {
      violations.push({ category: 'structural', pattern: name, match: m[0], position: m.index ?? 0 })
    }
  }

  // Opener clichés — first 200 chars only
  const opener = text.slice(0, 200)
  for (const regex of AI_TELL_OPENERS) {
    const m = opener.match(regex)
    if (m) violations.push({ category: 'opener', pattern: regex.source, match: m[0], position: m.index ?? 0 })
  }

  return violations
}

export const AI_TELL_BAN_LIST_FOR_PROMPT = `═══════════════════════════════════════════════════════════════════
ABSOLUTE BANS — AI-tells that auto-fail (research 2025-2026):
═══════════════════════════════════════════════════════════════════

⛔ TYPOGRAPHY — ZERO TOLERANCE (V17 — user-mandated, no exceptions):
- Em-dashes (—) → BANNED ANYWHERE. Use a period or comma instead.
    BAD:  "DraftKings is launching the Super App — combining sports and casino"
    GOOD: "DraftKings is launching the Super App. It combines sports and casino."
    GOOD: "DraftKings is launching the Super App, combining sports and casino."
- Tilde (~) → BANNED ANYWHERE for any meaning. Write "around" or "about".
    BAD:  "~75% recovery", "~$5M", "~3x"
    GOOD: "around 75% recovery", "about $5M", "roughly 3x"
- En-dashes (–) between words → BANNED. Use hyphen or comma.
- Curly quotes (' ' " ") → use straight quotes ' "
- Bullet chars • → use hyphens or no bullets
- Ellipsis (…) → use three periods or nothing

⛔ VOCABULARY — words that scream "AI wrote this" — NEVER use:
delve, tapestry, landscape, realm, testament, underscore, underpinnings,
pivotal, foster, robust, garner, bolster, intricate, intricacies, interplay,
meticulous, vibrant, showcase, commendable, strategically, leverage, synergy,
streamline, unlock, transform, revolutionize, revolutionary, game-changer,
best-in-class, innovative, paradigm, cutting-edge, holistic, disruptive,
scalable, opportunity,
incumbent, ostensibly, paramount, salient, pertinent, henceforth, expedite,
facilitate, juncture, endeavor, commensurate, aforementioned, notwithstanding,
subsequent, purport, hereby, whereby, wherein, albeit, thereby, heretofore,
hitherto, erstwhile, moreover, utilize, commence, terminate, ascertain,
elucidate, orchestrating, facilitating

If you'd say it to a friend at a bar, it's fine. If it sounds like a 1990s
business book, drop it. Examples:
  BAD:  "renegotiating with your incumbent processor"
  GOOD: "renegotiating with your current processor"
  BAD:  "facilitate seamless integration"
  GOOD: "make integration easier"
  BAD:  "utilize our platform to expedite"
  GOOD: "use our platform to speed up"

STRUCTURAL PATTERNS (LLM tics):
- Copula avoidance ("Yuno serves as the layer" → "Yuno is the layer")
- Negative parallelism ("Not just X, but also Y" → just say Y)
- Rule of three adjectives ("efficient, scalable, and reliable" → pick one)
- Present-participle drift ("...enabling X, driving Y, fostering Z")
- "In today's [fast-paced/complex] [landscape/world]" openers
- Vague attribution ("Industry reports suggest", "Experts argue")
- "Despite its X, faces several challenges" pivots
- Pixel-precision metrics (+3.2pp, $4.7M) → round naturally ("about +3pp", "millions")
- Clinical parentheticals like "(card-not-present, different issuer behavior)"

OPENER CLICHÉS (auto-fail):
- "Hope this finds you well" + ANY variant
- "I'm reaching out", "I wanted to reach out", "I'd like to introduce"
- "Saw your X", "Congrats on Y", "Noticed your hire/funding"
- "Just checking in", "Following up", "Quick question:", "Circle back"
- "Looking forward to it/hearing/connecting"

NATURAL LANGUAGE PRINCIPLES:
- Vary sentence length (humans bursty, AI uniform)
- Use contractions (I'm, don't, it's)
- Round numbers naturally (about +3pp, around 5pts)
- One thought per sentence
- First-person singular "I" for cold (not "we")
`
