import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye } from 'lucide-react'
import type { ICPBuilderData } from '@/types/icp-builder'
import { buildICPPrompt } from '@/lib/icp-prompt-builder'

interface ICPPromptPreviewProps {
  data: ICPBuilderData
  visible: boolean
}

export function ICPPromptPreview({ data, visible }: ICPPromptPreviewProps) {
  const prompt = useMemo(() => buildICPPrompt(data), [data])

  if (!visible) return null

  return (
    <Card className="bg-muted/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          Generated AI Prompt
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {prompt ? (
          <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">
            {prompt}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Fill in the builder sections above to generate a prompt...
          </p>
        )}
      </CardContent>
    </Card>
  )
}
