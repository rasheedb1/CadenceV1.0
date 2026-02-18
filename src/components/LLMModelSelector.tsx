import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Brain, ChevronDown, Check, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

const LLM_OPTIONS = {
  openai: {
    label: 'OpenAI',
    models: [
      { value: 'gpt-5.2', label: 'GPT-5.2 Thinking' },
      { value: 'gpt-5.1', label: 'GPT-5.1' },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'o3-mini', label: 'o3 Mini' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    models: [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (Legacy)' },
    ],
  },
} as const

type Provider = keyof typeof LLM_OPTIONS

function getModelLabel(provider: string, model: string): string {
  const providerConfig = LLM_OPTIONS[provider as Provider]
  if (!providerConfig) return model
  const modelConfig = providerConfig.models.find((m) => m.value === model)
  return modelConfig?.label || model
}

export function LLMModelSelector() {
  const { user } = useAuth()
  const [provider, setProvider] = useState<string>('openai')
  const [model, setModel] = useState<string>('gpt-4o')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('llm_provider, llm_model')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProvider(data.llm_provider || 'openai')
          setModel(data.llm_model || 'gpt-4o')
        }
        setLoaded(true)
      })
  }, [user?.id])

  const handleSelect = async (newProvider: string, newModel: string) => {
    if (!user?.id) return
    if (newProvider === provider && newModel === model) return

    setProvider(newProvider)
    setModel(newModel)
    setSaving(true)

    await supabase
      .from('profiles')
      .update({ llm_provider: newProvider, llm_model: newModel })
      .eq('user_id', user.id)

    setSaving(false)
  }

  if (!loaded) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal">
          <Brain className="h-3 w-3" />
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            getModelLabel(provider, model)
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {Object.entries(LLM_OPTIONS).map(([provKey, provConfig]) => (
          <div key={provKey}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {provConfig.label}
            </DropdownMenuLabel>
            {provConfig.models.map((m) => (
              <DropdownMenuItem
                key={m.value}
                onClick={() => handleSelect(provKey, m.value)}
                className="flex items-center justify-between"
              >
                <span>{m.label}</span>
                {provider === provKey && model === m.value && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
            {provKey === 'openai' && <DropdownMenuSeparator />}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
