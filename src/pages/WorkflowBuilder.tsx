import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type OnConnect,
  type Node,
  BackgroundVariant,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'
import { useWorkflow } from '@/contexts/WorkflowContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, Play, Pause, Users } from 'lucide-react'
import { NodePalette } from '@/components/workflow/NodePalette'
import { NodeConfigPanel } from '@/components/workflow/NodeConfigPanel'
import { TriggerNode } from '@/components/workflow/nodes/TriggerNode'
import { ActionNode } from '@/components/workflow/nodes/ActionNode'
import { ConditionNode } from '@/components/workflow/nodes/ConditionNode'
import { DelayNode } from '@/components/workflow/nodes/DelayNode'
import {
  WORKFLOW_NODE_CONFIG,
  WORKFLOW_STATUS_CONFIG,
  type WorkflowNodeType,
} from '@/types/workflow'

const nodeTypes: NodeTypes = {
  trigger_manual: TriggerNode,
  trigger_new_lead: TriggerNode,
  action_linkedin_message: ActionNode,
  action_linkedin_connect: ActionNode,
  action_linkedin_like: ActionNode,
  action_linkedin_comment: ActionNode,
  action_task: ActionNode,
  condition_connection_accepted: ConditionNode,
  condition_message_received: ConditionNode,
  condition_lead_attribute: ConditionNode,
  condition_time_elapsed: ConditionNode,
  delay_wait: DelayNode,
}

let nodeId = 0
function getNodeId() {
  return `node_${++nodeId}_${Date.now()}`
}

export function WorkflowBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { workflows, updateWorkflow, saveGraph, activateWorkflow, pauseWorkflow } = useWorkflow()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)

  const workflow = workflows.find((w) => w.id === id)

  const [nodes, setNodes, onNodesChange] = useNodesState(
    workflow?.graph_json?.nodes || []
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    workflow?.graph_json?.edges || []
  )
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [workflowName, setWorkflowName] = useState(workflow?.name || '')
  const [saving, setSaving] = useState(false)

  // Sync when workflow data loads
  useEffect(() => {
    if (workflow) {
      setNodes(workflow.graph_json?.nodes || [])
      setEdges(workflow.graph_json?.edges || [])
      setWorkflowName(workflow.name)
    }
  }, [workflow?.id])

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      const edgeStyle = params.sourceHandle === 'no'
        ? { stroke: '#ef4444', strokeWidth: 2 }
        : params.sourceHandle === 'yes'
          ? { stroke: '#22c55e', strokeWidth: 2 }
          : { strokeWidth: 2 }

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: edgeStyle,
            label: params.sourceHandle === 'yes' ? 'Yes' : params.sourceHandle === 'no' ? 'No' : undefined,
          },
          eds
        )
      )
    },
    [setEdges]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const nodeType = event.dataTransfer.getData('application/reactflow') as WorkflowNodeType
      if (!nodeType || !reactFlowInstance || !reactFlowWrapper.current) return

      const config = WORKFLOW_NODE_CONFIG[nodeType]
      if (!config) return

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      })

      const newNode: Node = {
        id: getNodeId(),
        type: nodeType,
        position,
        data: { ...config.defaultData },
      }

      setNodes((nds) => [...nds, newNode])
    },
    [reactFlowInstance, setNodes]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node)
    },
    []
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleNodeDataUpdate = useCallback(
    (updatedNodeId: string, data: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === updatedNodeId ? { ...n, data } : n))
      )
      setSelectedNode((prev) =>
        prev && prev.id === updatedNodeId ? { ...prev, data } : prev
      )
    },
    [setNodes]
  )

  const handleSave = useCallback(async () => {
    if (!id) return
    setSaving(true)
    try {
      if (workflowName !== workflow?.name) {
        await updateWorkflow(id, { name: workflowName })
      }
      await saveGraph(id, { nodes, edges })
      toast.success('Workflow saved')
    } catch (error) {
      toast.error('Failed to save workflow')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }, [id, workflowName, workflow?.name, nodes, edges, updateWorkflow, saveGraph])

  const handleActivate = async () => {
    if (!id) return
    await handleSave()
    try {
      await activateWorkflow(id)
      toast.success('Workflow activated')
    } catch (error) {
      toast.error('Failed to activate workflow')
    }
  }

  const handlePause = async () => {
    if (!id) return
    try {
      await pauseWorkflow(id)
      toast.success('Workflow paused')
    } catch (error) {
      toast.error('Failed to pause workflow')
    }
  }

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const statusConfig = WORKFLOW_STATUS_CONFIG[workflow.status]

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/workflows')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="h-8 w-[250px] text-sm font-semibold border-none shadow-none focus-visible:ring-0 px-1"
          />
          <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'}>
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/workflows/${id}/runs`)}
          >
            <Users className="mr-2 h-4 w-4" />
            Runs
          </Button>
          {workflow.status === 'active' ? (
            <Button variant="outline" size="sm" onClick={handlePause}>
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleActivate}>
              <Play className="mr-2 h-4 w-4" />
              Activate
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />

        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            className="bg-background"
          >
            <Controls className="!bg-background !border !shadow-sm" />
            <MiniMap
              className="!bg-background !border !shadow-sm"
              nodeColor={(node) => {
                const type = node.type || ''
                if (type.startsWith('trigger_')) return '#10b981'
                if (type.startsWith('action_')) return '#3b82f6'
                if (type.startsWith('condition_')) return '#f59e0b'
                if (type.startsWith('delay_')) return '#64748b'
                return '#6b7280'
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Panel position="top-center">
              <div className="rounded-lg bg-background/80 backdrop-blur-sm border px-3 py-1.5 text-xs text-muted-foreground">
                Drag nodes from the palette on the left. Connect them by dragging between handles.
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleNodeDataUpdate}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  )
}
