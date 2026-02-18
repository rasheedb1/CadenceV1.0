// OpenAI Client for Supabase Edge Functions
// Documentation: https://platform.openai.com/docs/api-reference/chat

export interface OpenAIConfig {
  apiKey: string
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenAIResponseData {
  id: string
  object: 'chat.completion'
  model: string
  choices: Array<{
    index: number
    message: { role: 'assistant'; content: string }
    finish_reason: string
  }>
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface OpenAIResponse {
  success: boolean
  data?: OpenAIResponseData
  error?: string
}

export class OpenAIClient {
  private baseUrl = 'https://api.openai.com'
  private apiKey: string
  private defaultModel = 'gpt-4o'

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey
  }

  async createMessage(params: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    model?: string
    jsonMode?: boolean
  }): Promise<OpenAIResponse> {
    try {
      const model = params.model || this.defaultModel

      // Build messages array with system message first
      const messages: OpenAIMessage[] = []
      if (params.system) {
        messages.push({ role: 'system', content: params.system })
      }
      for (const msg of params.messages) {
        messages.push({ role: msg.role, content: msg.content })
      }

      const tokenLimit = params.maxTokens ?? 1024

      // GPT-5+ and o-series models require max_completion_tokens; older models use max_tokens
      const usesNewParam = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3')
      const body: Record<string, unknown> = {
        model,
        messages,
        ...(usesNewParam
          ? { max_completion_tokens: tokenLimit }
          : { max_tokens: tokenLimit }),
      }

      if (params.temperature !== undefined) body.temperature = params.temperature
      if (params.jsonMode) body.response_format = { type: 'json_object' }

      console.log(`OpenAI createMessage: model=${model}, tokenLimit=${tokenLimit}, jsonMode=${!!params.jsonMode}`)

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`OpenAI error ${response.status}:`, responseText)
        return { success: false, error: `OpenAI API ${response.status}: ${responseText}` }
      }

      const data = JSON.parse(responseText) as OpenAIResponseData
      console.log(`OpenAI response: ${data.usage?.prompt_tokens} prompt, ${data.usage?.completion_tokens} completion tokens`)
      return { success: true, data }
    } catch (error) {
      console.error('OpenAI request error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  extractText(response: OpenAIResponseData): string {
    return response.choices?.[0]?.message?.content || ''
  }
}

export function createOpenAIClient(): OpenAIClient {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }
  return new OpenAIClient({ apiKey })
}
