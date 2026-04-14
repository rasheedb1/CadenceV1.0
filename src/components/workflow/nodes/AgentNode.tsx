import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Bot,
  BrainCircuit,
  CheckCircle,
  Bell,
} from 'lucide-react'

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  action_agent_skill: Bot,
  action_agent_task: BrainCircuit,
  action_agent_review: CheckCircle,
  action_notify_human: Bell,
}

interface AgentNodeData {
  label: string
  agentName?: string
  skillDisplayName?: string
  channel?: string
}

function AgentNodeComponent({ data, type, selected }: NodeProps) {
  const nodeData = data as AgentNodeData
  const Icon = AGENT_ICONS[type as string] || Bot
  const isReview = type === 'action_agent_review'
  const isNotify = type === 'action_notify_human'

  return (
    <div
      className={`rounded-xl border-2 bg-background px-4 py-3 shadow-sm min-w-[200px] transition-all ${
        selected ? 'border-violet-500 shadow-md' : 'border-violet-300 dark:border-violet-700'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-violet-500 !bg-background"
      />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50">
          <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
            {isNotify ? 'Notify' : isReview ? 'Review' : 'Agent'}
          </p>
          <p className="text-sm font-semibold truncate">{nodeData.label}</p>
          {nodeData.agentName && (
            <p className="text-xs text-muted-foreground truncate">{nodeData.agentName}{nodeData.skillDisplayName ? ` · ${nodeData.skillDisplayName}` : ''}</p>
          )}
        </div>
      </div>
      {isReview ? (
        <>
          {/* Review has approved / needs_revision outputs */}
          <div className="mt-2 flex justify-between text-[10px] font-medium px-2">
            <span className="text-emerald-600">Approved</span>
            <span className="text-orange-500">Revision</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="approved"
            className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background !left-[30%]" />
          <Handle type="source" position={Position.Bottom} id="needs_revision"
            className="!h-3 !w-3 !border-2 !border-orange-500 !bg-background !left-[70%]" />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-violet-500 !bg-background" />
      )}
    </div>
  )
}

export const AgentNode = memo(AgentNodeComponent)
