import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Timer } from 'lucide-react'
function DelayNodeComponent({ data, selected }: NodeProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeData = data as any

  return (
    <div
      className={`rounded-xl border-2 bg-background px-4 py-3 shadow-sm min-w-[180px] transition-all ${
        selected ? 'border-slate-500 shadow-md' : 'border-slate-300 dark:border-slate-600'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-slate-500 !bg-background"
      />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Timer className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Delay</p>
          <p className="text-sm font-semibold">
            {nodeData.label}
            {nodeData.duration ? ` (${nodeData.duration} ${nodeData.unit || 'days'})` : ''}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-slate-500 !bg-background"
      />
    </div>
  )
}

export const DelayNode = memo(DelayNodeComponent)
