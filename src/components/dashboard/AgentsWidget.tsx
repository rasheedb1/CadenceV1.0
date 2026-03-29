import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAgents } from '@/contexts/AgentContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Bot, ArrowRight, Zap } from 'lucide-react'

/**
 * Micro-animation #2: Animated agents grid with staggered entrance,
 * breathing status indicators, and hover lift.
 */

const STATUS_CONFIG: Record<string, { color: string; pulse: boolean; label: string }> = {
  active: { color: 'bg-green-500', pulse: true, label: 'Activo' },
  draft: { color: 'bg-gray-400', pulse: false, label: 'Borrador' },
  deploying: { color: 'bg-yellow-500', pulse: true, label: 'Desplegando' },
  paused: { color: 'bg-orange-400', pulse: false, label: 'Pausado' },
  error: { color: 'bg-red-500', pulse: true, label: 'Error' },
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
}

export function AgentsWidget() {
  const navigate = useNavigate()
  const { agents } = useAgents()
  const activeCount = agents.filter(a => a.status === 'active').length

  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agentes IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <motion.div
            className="flex flex-col items-center justify-center py-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Bot className="h-12 w-12 text-muted-foreground mb-3" />
            </motion.div>
            <p className="text-sm text-muted-foreground mb-3">
              Aún no tienes agentes configurados
            </p>
            <Button size="sm" onClick={() => navigate('/agents')}>
              <Zap className="mr-2 h-4 w-4" />
              Crear Agente
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agentes IA
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {activeCount} de {agents.length} activos
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')}>
          Ver Todos
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <motion.div
          className="grid gap-3 sm:grid-cols-2"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {agents.slice(0, 6).map((agent) => {
            const config = STATUS_CONFIG[agent.status] || STATUS_CONFIG.draft
            return (
              <motion.div
                key={agent.id}
                variants={cardVariants}
                whileHover={{ y: -4, boxShadow: '0 8px 25px rgba(0,0,0,0.1)' }}
                className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => navigate(`/agents/${agent.id}`)}
              >
                {/* Avatar with breathing status */}
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg">
                    🤖
                  </div>
                  {/* Status dot */}
                  <motion.span
                    className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${config.color}`}
                    animate={config.pulse ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] } : {}}
                    transition={config.pulse ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{agent.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {agent.role || 'Sin rol'}
                  </p>
                </div>

                {/* Status badge */}
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {config.label}
                </Badge>
              </motion.div>
            )
          })}
        </motion.div>
      </CardContent>
    </Card>
  )
}
