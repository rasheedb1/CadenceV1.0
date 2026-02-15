import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play, UserPlus } from 'lucide-react'
function TriggerNodeComponent({ data, type, selected }: NodeProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeData = data as any
  const isNewLead = type === 'trigger_new_lead'

  return (
    <div
      className={`rounded-xl border-2 bg-background px-4 py-3 shadow-sm min-w-[180px] transition-all ${
        selected ? 'border-emerald-500 shadow-md' : 'border-emerald-300 dark:border-emerald-700'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
          {isNewLead ? (
            <UserPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Trigger</p>
          <p className="text-sm font-semibold">{nodeData.label}</p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background"
      />
    </div>
  )
}

export const TriggerNode = memo(TriggerNodeComponent)
