// Global anti-patterns for AI message generation
// Comprehensive banned openings, phrases, closings, and structural issues
// in English, Spanish, and Portuguese

export const GLOBAL_ANTI_PATTERNS = {
  // ─── Banned Openings ──────────────────────────────────────────
  banned_openings: {
    en: [
      'I hope this message finds you well',
      'I came across your profile',
      'I noticed that you',
      'I was impressed by',
      'I wanted to reach out',
      'I am writing to',
      'I\'d love to connect',
      'I saw that you',
      'Hope you\'re doing well',
      'Hope all is well',
      'I\'m reaching out because',
      'As a fellow',
      'I couldn\'t help but notice',
    ],
    es: [
      'Espero que este mensaje te encuentre bien',
      'Espero que estés bien',
      'Vi tu perfil',
      'Me encontré con tu perfil',
      'Noté que',
      'Me impresionó',
      'Quería contactarte',
      'Te escribo porque',
      'Me encantaría conectar',
      'Vi que tú',
      'Como fellow',
      'No pude evitar notar',
      'Espero no molestar',
    ],
    pt: [
      'Espero que esta mensagem te encontre bem',
      'Espero que esteja bem',
      'Vi o seu perfil',
      'Encontrei o seu perfil',
      'Notei que',
      'Fiquei impressionado',
      'Queria entrar em contato',
      'Escrevo porque',
      'Adoraria conectar',
      'Vi que você',
      'Como colega',
      'Não pude deixar de notar',
    ],
  },

  // ─── Banned Phrases ───────────────────────────────────────────
  banned_phrases: {
    en: [
      'leverage', 'synergy', 'game-changer', 'paradigm shift', 'circle back',
      'touch base', 'low-hanging fruit', 'move the needle', 'at the end of the day',
      'take it to the next level', 'think outside the box', 'win-win',
      'best-in-class', 'cutting-edge', 'state-of-the-art', 'robust solution',
      'seamless integration', 'holistic approach', 'deep dive',
      'value proposition', 'pain points', 'bandwidth', 'scalable',
      'disruptive', 'innovative solution', 'streamline', 'optimize',
      'revolutionize', 'transform your', 'unlock the potential',
      'I\'d love to pick your brain', 'quick question',
      'I know you\'re busy', 'not sure if you\'re the right person',
      'just following up', 'wanted to check in', 'circling back',
      'per my last message', 'as per our conversation',
    ],
    es: [
      'sinergia', 'paradigma', 'innovador', 'disruptivo', 'solución robusta',
      'potenciar', 'apalancar', 'llevar al siguiente nivel',
      'pensar fuera de la caja', 'ganar-ganar', 'win-win',
      'de vanguardia', 'estado del arte', 'integración seamless',
      'enfoque holístico', 'profundizar', 'propuesta de valor',
      'puntos de dolor', 'escalable', 'optimizar', 'revolucionar',
      'transformar tu', 'desbloquear el potencial',
      'me encantaría conocer tu opinión', 'pregunta rápida',
      'sé que estás ocupado', 'no sé si eres la persona correcta',
      'solo dando seguimiento', 'quería ver cómo',
      'como mencioné', 'según nuestra conversación',
      'en ese sentido', 'bajo esa premisa', 'ante lo anterior',
    ],
    pt: [
      'sinergia', 'paradigma', 'inovador', 'disruptivo', 'solução robusta',
      'potencializar', 'alavancar', 'levar ao próximo nível',
      'pensar fora da caixa', 'ganha-ganha', 'win-win',
      'de vanguarda', 'estado da arte', 'integração seamless',
      'abordagem holística', 'aprofundar', 'proposta de valor',
      'pontos de dor', 'escalável', 'otimizar', 'revolucionar',
      'transformar seu', 'desbloquear o potencial',
      'adoraria saber sua opinião', 'pergunta rápida',
      'sei que você está ocupado', 'não sei se você é a pessoa certa',
      'só fazendo follow up', 'queria ver como',
      'conforme mencionei', 'conforme nossa conversa',
      'nesse sentido', 'sob essa premissa', 'diante do exposto',
    ],
  },

  // ─── Banned Closings ──────────────────────────────────────────
  banned_closings: {
    en: [
      'Let me know if you\'d like to chat',
      'Would love to schedule a quick call',
      'Are you free for a 15-minute call',
      'Can I send you more information',
      'Would it make sense to connect',
      'I\'d love to learn more about',
      'Looking forward to hearing from you',
      'Let me know your thoughts',
      'Don\'t hesitate to reach out',
      'Feel free to reach out',
      'I look forward to',
      'Happy to chat anytime',
      'Let\'s set up a time',
    ],
    es: [
      'Dime si te gustaría hablar',
      'Me encantaría agendar una llamada',
      'Estás libre para una llamada de 15 minutos',
      'Puedo enviarte más información',
      'Tendría sentido conectar',
      'Me encantaría saber más',
      'Quedo atento a tu respuesta',
      'Quedo a tus órdenes',
      'Quedo a tu disposición',
      'No dudes en contactarme',
      'Siéntete libre de contactarme',
      'Espero tu respuesta',
      'Agendemos una llamada',
    ],
    pt: [
      'Me diga se gostaria de conversar',
      'Adoraria agendar uma ligação',
      'Você está livre para uma ligação de 15 minutos',
      'Posso te enviar mais informações',
      'Faria sentido conectar',
      'Adoraria saber mais',
      'Fico no aguardo',
      'Fico à disposição',
      'Não hesite em me contatar',
      'Fique à vontade para me contatar',
      'Aguardo seu retorno',
      'Vamos agendar uma ligação',
    ],
  },

  // ─── Structural Anti-Patterns ─────────────────────────────────
  structural: [
    'Opening with self-introduction (I am... / My name is... / I work at...)',
    'More than one CTA or question in the message',
    'Wall of text without paragraph breaks',
    'Message reads like a template with blanks filled in',
    'Using bullet points or numbered lists in LinkedIn messages',
    'Starting with a compliment that feels generic or forced',
    'Pitching the product/service before establishing relevance',
    'Using the prospect\'s full name mid-message (feels robotic)',
  ],

  // ─── Format Anti-Patterns ────────────────────────────────────
  format: [
    'Em dashes (—) — use commas, periods, or parentheses instead',
    'Semicolons (;) — use shorter sentences or commas',
    'Markdown formatting (**bold**, *italic*, # headers)',
    'Excessive exclamation marks (more than one per message)',
    'ALL CAPS words for emphasis',
    'Ellipsis (...) for dramatic effect',
    'Quotation marks around common words for "emphasis"',
    'Emojis (unless explicitly requested)',
  ],

  // ─── Tone Anti-Patterns ──────────────────────────────────────
  tone: [
    'Overly enthusiastic or excited tone',
    'Fake humility ("I\'m not sure if..." / "This might not be relevant...")',
    'Presumptuous familiarity ("As you know..." / "I\'m sure you agree...")',
    'Passive-aggressive follow-ups ("Just checking if you saw my last message")',
    'Condescending expertise ("Let me explain..." / "You might not know...")',
    'Manipulative urgency ("Limited spots" / "This won\'t last")',
    'Flattery that feels calculated ("I\'m a huge fan of your work")',
  ],
} as const

// Helper: Get all banned phrases for a given language code
export function getBannedPhrasesForLanguage(langCode: string): string[] {
  const lang = langCode.startsWith('pt') ? 'pt'
    : langCode.startsWith('es') ? 'es'
    : 'en'

  return [
    ...GLOBAL_ANTI_PATTERNS.banned_openings[lang],
    ...GLOBAL_ANTI_PATTERNS.banned_phrases[lang],
    ...GLOBAL_ANTI_PATTERNS.banned_closings[lang],
  ]
}

// Helper: Check a message for banned phrases, returns found violations
export function findBannedPhrases(message: string, langCode: string): string[] {
  const banned = getBannedPhrasesForLanguage(langCode)
  const lower = message.toLowerCase()
  return banned.filter(phrase => lower.includes(phrase.toLowerCase()))
}

// Helper: Check for format violations
export function findFormatViolations(message: string): string[] {
  const violations: string[] = []
  if (message.includes('—')) violations.push('Contains em dashes (—)')
  if (message.includes(';')) violations.push('Contains semicolons')
  if (/\*\*[^*]+\*\*/.test(message) || /\*[^*]+\*/.test(message) || /^#+\s/m.test(message)) {
    violations.push('Contains markdown formatting')
  }
  if ((message.match(/!/g) || []).length > 1) violations.push('Multiple exclamation marks')
  if (/[A-Z]{4,}/.test(message.replace(/SUBJECT:/g, ''))) violations.push('ALL CAPS words')
  return violations
}

// Helper: Build anti-patterns section for the prompt
export function buildAntiPatternsPromptSection(langCode: string, userAntiPatterns: string[]): string {
  const lang = langCode.startsWith('pt') ? 'pt'
    : langCode.startsWith('es') ? 'es'
    : 'en'

  const parts: string[] = []

  parts.push('## ANTI-PATTERNS — NEVER DO THIS:')

  parts.push('\nBANNED OPENINGS:')
  for (const phrase of GLOBAL_ANTI_PATTERNS.banned_openings[lang].slice(0, 8)) {
    parts.push(`- "${phrase}"`)
  }

  parts.push('\nBANNED PHRASES:')
  for (const phrase of GLOBAL_ANTI_PATTERNS.banned_phrases[lang].slice(0, 12)) {
    parts.push(`- "${phrase}"`)
  }

  parts.push('\nBANNED CLOSINGS:')
  for (const phrase of GLOBAL_ANTI_PATTERNS.banned_closings[lang].slice(0, 8)) {
    parts.push(`- "${phrase}"`)
  }

  parts.push('\nSTRUCTURAL RULES:')
  for (const rule of GLOBAL_ANTI_PATTERNS.structural) {
    parts.push(`- ${rule}`)
  }

  parts.push('\nFORMAT RULES:')
  for (const rule of GLOBAL_ANTI_PATTERNS.format) {
    parts.push(`- ${rule}`)
  }

  parts.push('\nTONE RULES:')
  for (const rule of GLOBAL_ANTI_PATTERNS.tone) {
    parts.push(`- ${rule}`)
  }

  // User-defined anti-patterns
  if (userAntiPatterns.length > 0) {
    parts.push('\nCUSTOM ANTI-PATTERNS:')
    for (const p of userAntiPatterns) {
      parts.push(`- ${p}`)
    }
  }

  return parts.join('\n')
}
