// Language detection based on LinkedIn location
// Used to auto-detect the prospect's language and cultural context

export interface LanguageConfig {
  language: string
  code: string
  cultural_context: string
  formality: string
  greeting_style: string
}

export function detectLanguage(linkedinLocation: string | null): LanguageConfig {
  if (!linkedinLocation) {
    return {
      language: 'English',
      code: 'en',
      cultural_context: 'Default professional tone. Direct, concise.',
      formality: 'professional',
      greeting_style: "No greeting needed in LinkedIn. 'Hi {first_name},' for email.",
    }
  }

  const location = linkedinLocation.toLowerCase().trim()

  // LATAM (Spanish, tuteo)
  const latam = [
    'mexico', 'colombia', 'argentina', 'chile', 'peru', 'ecuador', 'uruguay',
    'paraguay', 'bolivia', 'costa rica', 'panama', 'guatemala', 'honduras',
    'el salvador', 'nicaragua', 'dominican republic', 'republica dominicana',
    'venezuela', 'puerto rico', 'cdmx', 'ciudad de mexico', 'bogota',
    'buenos aires', 'santiago', 'lima', 'medellin', 'monterrey', 'guadalajara',
    'quito', 'montevideo', 'san jose', 'asuncion', 'caracas', 'barranquilla',
  ]
  if (latam.some(place => location.includes(place))) {
    return {
      language: 'Spanish',
      code: 'es',
      cultural_context: "Latin American Spanish. Use 'tu' (tuteo). Warm but professional. Business culture values personal connection before getting to the point. Use 'ustedes' not 'vosotros'.",
      formality: 'warm-professional',
      greeting_style: "Use 'Hola {first_name},' for email. No greeting for LinkedIn connection note.",
    }
  }

  // Spain (Spanish, usted in corporate)
  const spain = ['spain', 'espana', 'madrid', 'barcelona', 'valencia', 'sevilla', 'bilbao', 'malaga']
  if (spain.some(place => location.includes(place))) {
    return {
      language: 'Spanish',
      code: 'es',
      cultural_context: "European Spanish. Use 'usted' in first contact with senior executives, 'tu' with peers. More formal than LATAM. Direct, get to the point faster.",
      formality: 'formal-professional',
      greeting_style: "Use 'Buenos dias {first_name},' for email. No greeting for LinkedIn connection note.",
    }
  }

  // Brazil (Portuguese)
  const brazil = [
    'brazil', 'brasil', 'sao paulo', 'rio de janeiro', 'belo horizonte',
    'curitiba', 'brasilia', 'recife', 'fortaleza', 'porto alegre', 'salvador',
    'campinas', 'florianopolis',
  ]
  if (brazil.some(place => location.includes(place))) {
    return {
      language: 'Portuguese',
      code: 'pt-br',
      cultural_context: "Brazilian Portuguese. Warm, friendly tone. Use 'voce'. Brazilians appreciate personal warmth even in business. Slightly more casual than LATAM Spanish in written communication.",
      formality: 'warm-professional',
      greeting_style: "Use 'Oi {first_name},' or 'Ola {first_name},' for email. No greeting for LinkedIn connection note.",
    }
  }

  // Portugal (Portuguese, more formal)
  const portugal = ['portugal', 'lisbon', 'lisboa', 'porto']
  if (portugal.some(place => location.includes(place))) {
    return {
      language: 'Portuguese',
      code: 'pt-pt',
      cultural_context: "European Portuguese. More formal than Brazilian Portuguese. Use 'voce' for peers, more formal for senior executives. Direct, professional.",
      formality: 'formal-professional',
      greeting_style: "Use 'Bom dia {first_name},' for email.",
    }
  }

  // French
  const french = [
    'france', 'paris', 'lyon', 'marseille', 'toulouse', 'quebec', 'montreal',
    'belgium', 'belgique', 'bruxelles', 'luxembourg', 'senegal', 'ivory coast',
    "cote d'ivoire", 'morocco', 'maroc', 'casablanca', 'tunisia',
  ]
  if (french.some(place => location.includes(place))) {
    return {
      language: 'French',
      code: 'fr',
      cultural_context: "French. Formal in first contact. Use 'vous'. French business culture values eloquence and precision. Keep structured and polished. Avoid overly American casualness.",
      formality: 'formal',
      greeting_style: "Use 'Bonjour {first_name},' for email.",
    }
  }

  // German
  const german = [
    'germany', 'deutschland', 'berlin', 'munich', 'munchen', 'frankfurt',
    'hamburg', 'austria', 'wien', 'vienna', 'zurich', 'switzerland', 'schweiz',
    'cologne', 'koln', 'dusseldorf', 'stuttgart',
  ]
  if (german.some(place => location.includes(place))) {
    return {
      language: 'German',
      code: 'de',
      cultural_context: "German. Formal, precise, data-driven. Use 'Sie' in first contact. Germans value directness and concrete facts over rapport-building. Lead with data, not warmth. Shorter messages preferred.",
      formality: 'formal',
      greeting_style: "Use 'Guten Tag {first_name},' for email.",
    }
  }

  // UK/Ireland (English but different culture)
  const uk = [
    'united kingdom', 'uk', 'london', 'manchester', 'birmingham', 'scotland',
    'edinburgh', 'ireland', 'dublin', 'leeds', 'bristol', 'glasgow',
  ]
  if (uk.some(place => location.includes(place))) {
    return {
      language: 'English',
      code: 'en-gb',
      cultural_context: 'British English. Slightly more formal and understated than American English. Appreciates subtlety. Avoid being too salesy or hyperbolic.',
      formality: 'professional-understated',
      greeting_style: "Use 'Hi {first_name},' for email.",
    }
  }

  // India (English with cultural nuances)
  const india = [
    'india', 'mumbai', 'bangalore', 'bengaluru', 'delhi', 'hyderabad',
    'pune', 'chennai', 'kolkata', 'gurgaon', 'noida', 'ahmedabad',
  ]
  if (india.some(place => location.includes(place))) {
    return {
      language: 'English',
      code: 'en',
      cultural_context: 'English for Indian market. Professional, respectful. Indian business culture values credentials and proof points more heavily. Mentioning recognizable client names has higher impact.',
      formality: 'professional-respectful',
      greeting_style: "Use 'Hi {first_name},' for email.",
    }
  }

  // Default: English
  return {
    language: 'English',
    code: 'en',
    cultural_context: 'Default professional tone. Direct, concise. American-style business communication.',
    formality: 'professional',
    greeting_style: "No greeting needed in LinkedIn. 'Hi {first_name},' for email.",
  }
}
