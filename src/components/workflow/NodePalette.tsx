import {
  Play,
  UserPlus,
  MessageSquare,
  ThumbsUp,
  MessageCircle,
  ClipboardList,
  UserCheck,
  Filter,
  Clock,
  Timer,
} from 'lucide-react'
import {
  WORKFLOW_NODE_CONFIG,
  WORKFLOW_NODE_CATEGORIES,
  type WorkflowNodeType,
  type WorkflowNodeCategory,
} from '@/types/workflow'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Play,
  UserPlus,
  MessageSquare,
  ThumbsUp,
  MessageCircle,
  ClipboardList,
  UserCheck,
  Filter,
  Clock,
  Timer,
}

const CATEGORY_ORDER: WorkflowNodeCategory[] = ['trigger', 'action', 'condition', 'delay']

const CATEGORY_COLORS: Record<WorkflowNodeCategory, string> = {
  trigger: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
  action: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
  condition: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
  delay: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
}

export function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: WorkflowNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-[220px] border-r bg-background overflow-y-auto">
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-4">Node Palette</h3>
        {CATEGORY_ORDER.map((category) => {
          const categoryConfig = WORKFLOW_NODE_CATEGORIES[category]
          const nodes = Object.entries(WORKFLOW_NODE_CONFIG).filter(
            ([, config]) => config.category === category
          )

          return (
            <div key={category} className="mb-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {categoryConfig.label}
              </p>
              <div className="space-y-1.5">
                {nodes.map(([nodeType, config]) => {
                  const Icon = ICON_MAP[config.icon] || Play
                  return (
                    <div
                      key={nodeType}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-grab hover:bg-accent/50 transition-colors active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => onDragStart(e, nodeType as WorkflowNodeType)}
                    >
                      <div className={`flex h-6 w-6 items-center justify-center rounded-md ${CATEGORY_COLORS[category]}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium">{config.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
