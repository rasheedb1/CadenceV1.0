// Anthropic Client for Supabase Edge Functions
// Documentation: https://docs.anthropic.com/en/api/messages

export interface AnthropicConfig {
  apiKey: string
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AnthropicResponseData {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{ type: 'text'; text: string }>
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | string | null
  usage: { input_tokens: number; output_tokens: number }
}

export interface AnthropicResponse {
  success: boolean
  data?: AnthropicResponseData
  error?: string
}

export class AnthropicClient {
  private baseUrl = 'https://api.anthropic.com'
  private apiKey: string
  private defaultModel = 'claude-opus-4-5-20251101'

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey
  }

  async createMessage(params: {
    system?: string
    messages: AnthropicMessage[]
    maxTokens?: number
    temperature?: number
    model?: string
  }): Promise<AnthropicResponse> {
    try {
      const body: Record<string, unknown> = {
        model: params.model || this.defaultModel,
        max_tokens: params.maxTokens ?? 1024,
        messages: params.messages,
      }

      if (params.system) body.system = params.system
      if (params.temperature !== undefined) body.temperature = params.temperature

      console.log(`Anthropic createMessage: model=${body.model}, max_tokens=${body.max_tokens}`)

      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`Anthropic error ${response.status}:`, responseText)
        return { success: false, error: `Anthropic API ${response.status}: ${responseText}` }
      }

      const data = JSON.parse(responseText) as AnthropicResponseData
      console.log(`Anthropic response: ${data.usage?.input_tokens} input, ${data.usage?.output_tokens} output tokens, stop_reason=${data.stop_reason}`)
      return { success: true, data }
    } catch (error) {
      console.error('Anthropic request error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  extractText(response: AnthropicResponseData): string {
    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
  }
}

export function createAnthropicClient(): AnthropicClient {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }
  return new AnthropicClient({ apiKey })
}
