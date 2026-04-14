import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Repeat, RotateCcw, HandMetal, GitBranch, CalendarClock } from 'lucide-react'

const CONTROL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  action_for_each: Repeat,
  action_retry: RotateCcw,
  condition_human_approval: HandMetal,
  condition_task_result: GitBranch,
  trigger_scheduled: CalendarClock,
}

function ControlNodeComponent({ data, type, selected }: NodeProps) {
  const nodeData = data as { label: string; description?: string }
  const Icon = CONTROL_ICONS[type as string] || GitBranch
  const isCondition = type?.startsWith('condition_')
  const isTrigger = type?.startsWith('trigger_')
  const isHumanApproval = type === 'condition_human_approval'
  const isRetry = type === 'action_retry'

  const borderColor = isTrigger ? 'emerald' : isCondition ? 'amber' : 'purple'

  return (
    <div
      className={`rounded-xl border-2 bg-background px-4 py-3 shadow-sm min-w-[200px] transition-all ${
        selected
          ? `border-${borderColor}-500 shadow-md`
          : `border-${borderColor}-300 dark:border-${borderColor}-700`
      }`}
    >
      {!isTrigger && (
        <Handle type="target" position={Position.Top}
          className={`!h-3 !w-3 !border-2 !border-${borderColor}-500 !bg-background`} />
      )}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-${borderColor}-100 dark:bg-${borderColor}-900/50`}>
          <Icon className={`h-4 w-4 text-${borderColor}-600 dark:text-${borderColor}-400`} />
        </div>
        <div>
          <p className={`text-xs font-medium text-${borderColor}-600 dark:text-${borderColor}-400`}>
            {isTrigger ? 'Trigger' : isCondition ? 'Decision' : 'Control'}
          </p>
          <p className="text-sm font-semibold">{nodeData.label}</p>
        </div>
      </div>

      {isCondition && !isHumanApproval && (
        <>
          <div className="mt-2 flex justify-between text-[10px] font-medium px-2">
            <span className="text-emerald-600">Yes</span>
            <span className="text-red-500">No</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="yes"
            className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background !left-[30%]" />
          <Handle type="source" position={Position.Bottom} id="no"
            className="!h-3 !w-3 !border-2 !border-red-500 !bg-background !left-[70%]" />
        </>
      )}

      {isHumanApproval && (
        <>
          <div className="mt-2 flex justify-between text-[10px] font-medium px-1">
            {(nodeData as unknown as { options?: string[] }).options?.map((opt: string, i: number) => (
              <span key={i} className="text-amber-600 text-center flex-1">{opt}</span>
            )) || <>
              <span className="text-emerald-600">Continue</span>
              <span className="text-red-500">Stop</span>
            </>}
          </div>
          <Handle type="source" position={Position.Bottom} id="yes"
            className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background !left-[30%]" />
          <Handle type="source" position={Position.Bottom} id="no"
            className="!h-3 !w-3 !border-2 !border-red-500 !bg-background !left-[70%]" />
          <Handle type="source" position={Position.Bottom} id="timeout"
            className="!h-3 !w-3 !border-2 !border-gray-400 !bg-background !left-[85%]" />
        </>
      )}

      {isRetry && (
        <>
          <div className="mt-2 flex justify-between text-[10px] font-medium px-2">
            <span className="text-emerald-600">Retry OK</span>
            <span className="text-red-500">Max exceeded</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="retry_success"
            className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background !left-[30%]" />
          <Handle type="source" position={Position.Bottom} id="max_retries_exceeded"
            className="!h-3 !w-3 !border-2 !border-red-500 !bg-background !left-[70%]" />
        </>
      )}

      {type === 'action_for_each' && (
        <>
          <div className="mt-2 flex justify-between text-[10px] font-medium px-2">
            <span className="text-violet-600">Each item</span>
            <span className="text-gray-500">Done</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="each_item"
            className="!h-3 !w-3 !border-2 !border-violet-500 !bg-background !left-[30%]" />
          <Handle type="source" position={Position.Bottom} id="loop_complete"
            className="!h-3 !w-3 !border-2 !border-gray-400 !bg-background !left-[70%]" />
        </>
      )}

      {isTrigger && (
        <Handle type="source" position={Position.Bottom}
          className={`!h-3 !w-3 !border-2 !border-${borderColor}-500 !bg-background`} />
      )}
    </div>
  )
}

export const ControlNode = memo(ControlNodeComponent)
