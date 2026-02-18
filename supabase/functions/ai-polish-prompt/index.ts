import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'

interface PolishPromptRequest {
  description: string
  promptType?: 'message' | 'research' | 'icp'
  stepType?: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
  tone?: 'professional' | 'casual' | 'friendly'
  language?: string
}

const STEP_TYPE_CONTEXT: Record<string, string> = {
  linkedin_message: `The prompt will be used to generate LinkedIn direct messages (DMs/InMails).
These messages should be max 200 words, open with a personalized reference, include a clear CTA, and feel human.`,

  linkedin_connect: `The prompt will be used to generate LinkedIn connection request notes.
These notes are STRICTLY limited to 300 characters. They must be extremely concise — just one specific reason to connect. No CTA, no questions.`,

  linkedin_comment: `The prompt will be used to generate comments on LinkedIn posts.
Comments should be max 150 words, add genuine value to the conversation, reference the post content, and avoid generic phrases like "Great post!".`,

  send_email: `The prompt will be used to generate cold outreach emails.
Emails can be longer and more structured than LinkedIn messages. They should have a compelling subject line, a clear opening hook, a value proposition tailored to the recipient, and a specific CTA. Keep them concise but informative — around 100-250 words for the body.`,
}

const TONE_DESCRIPTIONS: Record<string, string> = {
  professional: 'professional and direct, but human and warm',
  casual: 'casual and conversational, like talking to a colleague',
  friendly: 'friendly and approachable, with genuine enthusiasm',
}

function buildMessagePolishPrompt(stepType: string, tone: string, language: string): string {
  const stepContext = STEP_TYPE_CONTEXT[stepType] || STEP_TYPE_CONTEXT.linkedin_message
  const toneDesc = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.professional
  const langLabel = language === 'es' ? 'Spanish' : language === 'en' ? 'English' : language
  const isEmail = stepType === 'send_email'
  const messageLabel = isEmail ? 'emails' : 'LinkedIn messages'

  return `You are an expert prompt engineer specializing in B2B sales outreach${isEmail ? ' via cold email' : ' for LinkedIn'}.

Your job is to take a user's rough description of what they want and transform it into a clear, structured, and highly effective prompt that will be used by another AI to generate personalized ${messageLabel}.

## Context about the message type:
${stepContext}

## What the message-generating AI will have access to:
- The prospect's LinkedIn profile (name, headline, company, location, about section)
${isEmail ? '- The prospect\'s email address' : ''}
- The prospect's recent LinkedIn posts (last 5)
- Web research about the prospect and their company (news, articles, events)
- Template variables: {{first_name}}, {{last_name}}, {{company}}, {{title}}${isEmail ? ', {{email}}' : ''}

## Rules for the prompt you create:
1. Be specific about the desired tone: ${toneDesc}
2. Include clear instructions about WHAT to reference from the research (${isEmail ? 'company news, industry trends, recent announcements' : 'recent posts, company news'}, etc.)
3. Specify the Call-to-Action (CTA) clearly — what should the ${isEmail ? 'email' : 'message'} ask for?
4. Define the ${isEmail ? 'email' : 'message'} structure (${isEmail ? 'subject line, opening hook, value proposition, CTA' : 'opening hook, body, CTA'})
5. Include "DO NOT" rules to avoid common mistakes (${isEmail ? 'spammy subject lines, walls of text, generic openings' : 'generic openings, fake compliments'}, etc.)
6. Keep it as a set of clear instructions, NOT a template with placeholders
7. Write the prompt in: ${langLabel}
8. Make it actionable and unambiguous
${isEmail ? '9. Include instructions for generating a compelling SUBJECT line for the email\n' : ''}${isEmail ? '10' : '9'}. CRITICAL — Use template variables where appropriate. These variables will be automatically replaced with real data for each lead:
   - {{first_name}} — Prospect's first name
   - {{last_name}} — Prospect's last name
   - {{company}} — Prospect's company name
   - {{title}} — Prospect's job title/role
   Use these in the prompt to make it dynamic and personalized per lead. Example: "Reference something specific about {{company}} that shows you did your research..."

## Output format:
Return ONLY the polished prompt text. No explanations, no preamble, no "Here's your prompt:" prefix.
The output should be ready to use as-is as instructions for the ${isEmail ? 'email' : 'message'} generator.`
}

function buildICPPolishPrompt(language: string): string {
  const langLabel = language === 'es' ? 'Spanish' : language === 'en' ? 'English' : language

  return `You are an expert B2B sales strategist and ICP (Ideal Customer Profile) analyst.

Your job is to take a user's rough description of their target company profile and transform it into a clear, structured, and detailed ICP description that can be used to guide prospecting and Sales Navigator searches.

## Rules:
1. Preserve the user's core intent — don't change WHO they're targeting, just clarify and enrich the description
2. Add structure: break it into clear sections if useful (industry, size, signals, characteristics)
3. Be specific: replace vague terms with concrete criteria (e.g., "big companies" → "companies with 500+ employees or $50M+ revenue")
4. Add useful targeting signals the user might have missed (growth indicators, technology usage, market position, etc.)
5. Keep it as a natural-language description, NOT a rigid form or JSON
6. Write in: ${langLabel}
7. Be concise but comprehensive — aim for 3-8 sentences
8. Focus on characteristics that would help identify the RIGHT companies to target

## Output format:
Return ONLY the polished ICP description. No explanations, no preamble, no "Here's your polished description:" prefix.
The output should be ready to use as-is as a company targeting description.`
}

function buildResearchPolishPrompt(language: string): string {
  const langLabel = language === 'es' ? 'Spanish' : language === 'en' ? 'English' : language

  return `You are an expert prompt engineer specializing in B2B prospect research and intelligence analysis.

Your job is to take a user's rough description of what research/analysis they want and transform it into a clear, structured prompt that will be used by another AI to analyze and summarize research data about a prospect.

## Context about research prompts:
The prompt will control how an AI analyzes and synthesizes research data collected about a B2B prospect.
The research AI receives raw data and must produce an actionable intelligence summary for salespeople.

## What the research AI will receive:
- The prospect's LinkedIn profile (name, headline, company, location, about section)
- The prospect's recent LinkedIn posts (last 5)
- Web research results about the prospect and their company (news articles, funding announcements, partnerships, press releases)

## Rules for the research prompt you create:
1. Specify WHAT aspects of the prospect to prioritize (company growth, recent news, personal interests, industry trends, pain points, etc.)
2. Define the structure and format of the research output (bullet points, narrative, sections, etc.)
3. Specify what signals are most important for sales (hiring, funding, product launches, partnerships, challenges)
4. Include instructions about HOW to connect the dots between different data sources
5. Include "DO NOT" rules (don't invent data, don't speculate without evidence, etc.)
6. Keep it as a set of clear instructions, NOT a template
7. Write the prompt in: ${langLabel}
8. Make it actionable and unambiguous
9. CRITICAL — Use template variables where appropriate. These variables will be automatically replaced with real data for each lead:
   - {{first_name}} — Prospect's first name
   - {{last_name}} — Prospect's last name
   - {{company}} — Prospect's company name
   - {{title}} — Prospect's job title/role
   Use these in the prompt to personalize research per lead. Example: "Investiga la empresa {{company}} y analiza cómo {{first_name}} {{last_name}} en su rol de {{title}} podría beneficiarse..."

## Output format:
Return ONLY the polished research prompt text. No explanations, no preamble.
The output should be ready to use as-is as instructions for the research analyst AI.`
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const user = await getAuthUser(authHeader)
    if (!user) return errorResponse('Unauthorized', 401)

    // Parse request
    const body: PolishPromptRequest = await req.json()
    const {
      description,
      promptType = 'message',
      stepType,
      tone = 'professional',
      language = 'es',
    } = body

    if (!description || !description.trim()) {
      return errorResponse('description is required')
    }
    if (promptType === 'message' && !stepType) {
      return errorResponse('stepType is required for message prompts')
    }

    // Initialize LLM using user's settings
    let llm
    try {
      llm = await createLLMClientForUser(user.id)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    let systemPrompt: string
    let userContent: string

    if (promptType === 'icp') {
      systemPrompt = buildICPPolishPrompt(language)
      userContent = `Here is the user's rough description of their ideal target company:\n\n"${description.trim()}"\n\nTransform this into a polished, detailed ICP description.`
    } else if (promptType === 'research') {
      systemPrompt = buildResearchPolishPrompt(language)
      userContent = `Here is the user's rough description of what research/analysis they want:\n\n"${description.trim()}"\n\nTransform this into a polished, structured prompt for the research analyst AI.`
    } else {
      systemPrompt = buildMessagePolishPrompt(stepType || 'linkedin_message', tone, language)
      userContent = `Here is the user's rough description of what they want:\n\n"${description.trim()}"\n\nTransform this into a polished, structured prompt for the message generator.`
    }

    const result = await llm.createMessage({
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userContent,
      }],
      maxTokens: 1024,
      temperature: 0.5,
    })

    if (!result.success) {
      return errorResponse(`Failed to polish prompt: ${result.error}`, 500)
    }

    return jsonResponse({
      success: true,
      polishedPrompt: result.text,
    })
  } catch (error) {
    console.error('Polish prompt error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
