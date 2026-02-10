import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Workflow,
  Users,
  MessageSquare,
  Settings,
  LogOut,
  FileText,
  Shield,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cadences', href: '/cadences', icon: Workflow },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'LinkedIn Inbox', href: '/inbox', icon: MessageSquare },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Admin', href: '/admin', icon: Shield },
]

export function Sidebar() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center px-6">
        <span className="text-xl font-semibold tracking-tight">Laiky Cadence</span>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>
      <Separator />
      <div className="p-4">
        <div className="mb-3 truncate text-sm text-muted-foreground">
          {user?.email}
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3"
          onClick={signOut}
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
