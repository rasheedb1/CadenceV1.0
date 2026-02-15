import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  MessageSquare,
  UserPlus,
  ThumbsUp,
  MessageCircle,
  ClipboardList,
  Mail,
} from 'lucide-react'
const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  action_linkedin_message: MessageSquare,
  action_linkedin_connect: UserPlus,
  action_linkedin_like: ThumbsUp,
  action_linkedin_comment: MessageCircle,
  action_send_email: Mail,
  action_task: ClipboardList,
}

function ActionNodeComponent({ data, type, selected }: NodeProps) {
  const nodeData = data as { label: string }
  const Icon = ACTION_ICONS[type as string] || MessageSquare

  return (
    <div
      className={`rounded-xl border-2 bg-background px-4 py-3 shadow-sm min-w-[180px] transition-all ${
        selected ? 'border-blue-500 shadow-md' : 'border-blue-300 dark:border-blue-700'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-background"
      />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
          <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Action</p>
          <p className="text-sm font-semibold">{nodeData.label}</p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-background"
      />
    </div>
  )
}

export const ActionNode = memo(ActionNodeComponent)
