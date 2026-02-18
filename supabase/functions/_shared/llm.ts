// Unified LLM Client - abstracts Anthropic and OpenAI behind a common interface
// Usage: const llm = createLLMClient('openai', 'gpt-4o')

import { AnthropicClient, createAnthropicClient } from './anthropic.ts'
import { OpenAIClient, createOpenAIClient } from './openai.ts'

export type LLMProvider = 'anthropic' | 'openai'

export interface LLMResponse {
  success: boolean
  text: string
  error?: string
  usage?: { inputTokens: number; outputTokens: number }
}

export interface LLMClient {
  provider: LLMProvider
  model: string
  createMessage(params: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    jsonMode?: boolean
  }): Promise<LLMResponse>
}

// Available models per provider
export const LLM_MODELS: Record<LLMProvider, string[]> = {
  anthropic: [
    'claude-opus-4-6',
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-5-20251101',
  ],
  openai: [
    'gpt-5.2',
    'gpt-5.1',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'o3-mini',
  ],
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
}

class AnthropicLLMClient implements LLMClient {
  provider: LLMProvider = 'anthropic'
  model: string
  private client: AnthropicClient

  constructor(client: AnthropicClient, model?: string) {
    this.client = client
    this.model = model || DEFAULT_MODELS.anthropic
  }

  async createMessage(params: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    jsonMode?: boolean
  }): Promise<LLMResponse> {
    // Anthropic doesn't support jsonMode natively, but we still pass through other params
    const { jsonMode: _jsonMode, ...rest } = params
    const result = await this.client.createMessage({
      ...rest,
      model: this.model,
    })

    if (!result.success || !result.data) {
      return { success: false, text: '', error: result.error }
    }

    return {
      success: true,
      text: this.client.extractText(result.data),
      usage: {
        inputTokens: result.data.usage?.input_tokens || 0,
        outputTokens: result.data.usage?.output_tokens || 0,
      },
    }
  }
}

class OpenAILLMClient implements LLMClient {
  provider: LLMProvider = 'openai'
  model: string
  private client: OpenAIClient

  constructor(client: OpenAIClient, model?: string) {
    this.client = client
    this.model = model || DEFAULT_MODELS.openai
  }

  async createMessage(params: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    jsonMode?: boolean
  }): Promise<LLMResponse> {
    const result = await this.client.createMessage({
      ...params,
      model: this.model,
    })

    if (!result.success || !result.data) {
      return { success: false, text: '', error: result.error }
    }

    return {
      success: true,
      text: this.client.extractText(result.data),
      usage: {
        inputTokens: result.data.usage?.prompt_tokens || 0,
        outputTokens: result.data.usage?.completion_tokens || 0,
      },
    }
  }
}

/**
 * Create a unified LLM client.
 * @param provider - 'anthropic' or 'openai'
 * @param model - specific model ID (optional, uses default for provider)
 */
export function createLLMClient(provider: LLMProvider = 'openai', model?: string): LLMClient {
  if (provider === 'anthropic') {
    const client = createAnthropicClient()
    return new AnthropicLLMClient(client, model)
  } else {
    const client = createOpenAIClient()
    return new OpenAILLMClient(client, model)
  }
}

/**
 * Create an LLM client using the user's saved settings from the profiles table.
 * Falls back to OpenAI gpt-4o if no settings found.
 */
export async function createLLMClientForUser(userId: string): Promise<LLMClient> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=llm_provider,llm_model`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    )

    if (response.ok) {
      const rows = await response.json()
      if (rows.length > 0) {
        const { llm_provider, llm_model } = rows[0]
        console.log(`LLM settings for user ${userId}: provider=${llm_provider}, model=${llm_model}`)
        return createLLMClient(llm_provider as LLMProvider, llm_model)
      }
    }
  } catch (err) {
    console.error('Failed to read LLM settings, using default:', err)
  }

  console.log(`Using default LLM settings for user ${userId}: openai/gpt-4o`)
  return createLLMClient('openai', 'gpt-4o')
}
