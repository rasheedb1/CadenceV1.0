import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'

const APP_NAMES: Record<string, string> = {
  '/dashboard': 'Chief Outreach',
  '/cadences': 'Chief Outreach',
  '/workflows': 'Chief Outreach',
  '/leads': 'Chief Outreach',
  '/inbox': 'Chief Outreach',
  '/templates': 'Chief Outreach',
  '/ai-prompts': 'Chief Outreach',
  '/account-mapping': 'Chief Outreach',
  '/company-research': 'Chief Outreach',
  '/company-registry': 'Chief Outreach',
  '/business-cases': 'Chief Outreach',
  '/buyer-personas': 'Chief Outreach',
  '/account-executive': 'Chief Outreach',
  '/lead-search': 'Chief Outreach',
  '/notifications': 'Chief Outreach',
  '/outreach': 'Chief Outreach',
  '/agents': 'AI Agents',
  '/mission-control': 'Mission Control',
  '/settings': 'Settings',
  '/admin': 'Admin',
}

function getAppName(pathname: string): string {
  // Check exact match first, then prefix match
  if (APP_NAMES[pathname]) return APP_NAMES[pathname]
  for (const [prefix, name] of Object.entries(APP_NAMES)) {
    if (pathname.startsWith(prefix)) return name
  }
  return 'Chief'
}

export function AppHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const appName = getAppName(location.pathname)

  return (
    <div className="h-9 border-b bg-muted/30 flex items-center px-4 gap-2 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => navigate('/')}
        title="Go to home"
      >
        <Home className="h-3.5 w-3.5" />
      </Button>
      <span className="text-xs font-medium text-muted-foreground">{appName}</span>
    </div>
  )
}
