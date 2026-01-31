import { useCadence } from '@/contexts/CadenceContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Workflow, Users, MessageSquare, TrendingUp } from 'lucide-react'

export function Dashboard() {
  const { cadences, leads, isLoading } = useCadence()

  const activeCadences = cadences.filter((c) => c.status === 'active').length
  const activeLeads = leads.filter((l) => l.status === 'active').length
  const pendingLeads = leads.filter((l) => l.status === 'pending').length

  const stats = [
    {
      title: 'Active Cadences',
      value: activeCadences,
      total: cadences.length,
      icon: Workflow,
      description: 'Running sequences',
    },
    {
      title: 'Total Leads',
      value: leads.length,
      icon: Users,
      description: `${activeLeads} active, ${pendingLeads} pending`,
    },
    {
      title: 'Messages Sent',
      value: 0,
      icon: MessageSquare,
      description: 'This week',
    },
    {
      title: 'Response Rate',
      value: '0%',
      icon: TrendingUp,
      description: 'Average across cadences',
    },
  ]

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your sales automation</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stat.value}
                {stat.total !== undefined && (
                  <span className="text-sm font-normal text-muted-foreground">
                    /{stat.total}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Cadences</CardTitle>
            <CardDescription>Your latest sales sequences</CardDescription>
          </CardHeader>
          <CardContent>
            {cadences.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cadences yet. Create your first one!</p>
            ) : (
              <div className="space-y-4">
                {cadences.slice(0, 5).map((cadence) => (
                  <div key={cadence.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{cadence.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {cadence.steps?.length || 0} steps
                      </p>
                    </div>
                    <Badge variant={cadence.status === 'active' ? 'default' : 'secondary'}>
                      {cadence.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Leads</CardTitle>
            <CardDescription>Latest added contacts</CardDescription>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads yet. Import or add some!</p>
            ) : (
              <div className="space-y-4">
                {leads.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {lead.first_name} {lead.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {lead.company || lead.email || 'No details'}
                      </p>
                    </div>
                    <Badge
                      variant={
                        lead.status === 'active'
                          ? 'default'
                          : lead.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {lead.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
