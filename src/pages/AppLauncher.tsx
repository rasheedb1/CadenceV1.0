import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useAgents } from '@/contexts/AgentContext'
import { Card, CardContent } from '@/components/ui/card'
import { Plus } from 'lucide-react'

const PLATFORM_APPS = [
  {
    id: 'outreach',
    name: 'Chief Outreach',
    description: 'Sales automation, prospecting, cadences, LinkedIn & email outreach',
    icon: '🚀',
    href: '/dashboard',
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'agents',
    name: 'AI Agents',
    description: 'Create, deploy, and manage AI agents with specific roles',
    icon: '🤖',
    href: '/agents',
    gradient: 'from-purple-500 to-pink-600',
  },
  {
    id: 'mission-control',
    name: 'Mission Control',
    description: 'Real-time agent activity, communication graph, and performance metrics',
    icon: '🛰️',
    href: '/mission-control',
    gradient: 'from-emerald-500 to-teal-600',
  },
]

export function AppLauncher() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { org } = useOrg()
  const { agents } = useAgents()

  if (!user) return <Navigate to="/auth" replace />
  if (user && profile && !profile.onboarding_completed) return <Navigate to="/onboarding" replace />

  const activeAgents = agents.filter(a => a.status === 'active').length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg logo-gradient text-white text-sm font-bold">C</div>
            <span className="font-heading font-semibold text-lg">Chief</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {org?.name || 'My Organization'}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold font-heading tracking-tight">
            Welcome back{profile?.onboarding_completed ? '' : ''}
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Choose an app to get started
          </p>
        </div>

        {/* App Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_APPS.map(app => (
            <Card
              key={app.id}
              className="cursor-pointer group hover:shadow-lg transition-all duration-200 overflow-hidden border-2 hover:border-primary/20"
              onClick={() => navigate(app.href)}
            >
              <CardContent className="p-0">
                {/* Gradient header */}
                <div className={`h-24 bg-gradient-to-br ${app.gradient} flex items-center justify-center`}>
                  <span className="text-4xl">{app.icon}</span>
                </div>
                {/* Content */}
                <div className="p-5">
                  <h3 className="font-heading font-semibold text-lg group-hover:text-primary transition-colors">
                    {app.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {app.description}
                  </p>
                  {app.id === 'agents' && activeAgents > 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      {activeAgents} agent{activeAgents !== 1 ? 's' : ''} active
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Create New App (placeholder) */}
          <Card className="cursor-pointer group hover:shadow-lg transition-all duration-200 border-2 border-dashed hover:border-primary/30">
            <CardContent className="p-0 h-full flex flex-col">
              <div className="h-24 bg-muted/30 flex items-center justify-center">
                <Plus className="h-10 w-10 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
              </div>
              <div className="p-5 flex-1">
                <h3 className="font-heading font-semibold text-lg text-muted-foreground group-hover:text-foreground transition-colors">
                  Create New App
                </h3>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Build a new toolbox for your agents with custom integrations
                </p>
                <p className="text-xs text-muted-foreground/60 mt-3">Coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
