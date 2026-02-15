import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  UserCheck,
  MessageSquare,
  Filter,
  Clock,
} from 'lucide-react'

const CONDITION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  condition_connection_accepted: UserCheck,
  condition_message_received: MessageSquare,
  condition_lead_attribute: Filter,
  condition_time_elapsed: Clock,
}

function ConditionNodeComponent({ data, type, selected }: NodeProps) {
  const nodeData = data as { label: string }
  const Icon = CONDITION_ICONS[type as string] || Filter

  return (
    <div
      className={`rounded-xl border-2 bg-background px-4 py-3 shadow-sm min-w-[200px] transition-all ${
        selected ? 'border-amber-500 shadow-md' : 'border-amber-300 dark:border-amber-700'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-amber-500 !bg-background"
      />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
          <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Condition</p>
          <p className="text-sm font-semibold">{nodeData.label}</p>
        </div>
      </div>
      {/* Two output handles: Yes (left) and No (right) */}
      <div className="mt-2 flex justify-between text-[10px] font-medium px-2">
        <span className="text-emerald-600 dark:text-emerald-400">Yes</span>
        <span className="text-red-500 dark:text-red-400">No</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background !left-[30%]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!h-3 !w-3 !border-2 !border-red-500 !bg-background !left-[70%]"
      />
    </div>
  )
}

export const ConditionNode = memo(ConditionNodeComponent)
