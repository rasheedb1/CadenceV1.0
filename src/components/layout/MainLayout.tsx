import { Outlet, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Sidebar } from './Sidebar'
import { LogOut, Moon, Sun, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function MainLayout() {
  const { user, profile, loading, signOut } = useAuth()
  const { orgId, isLoading: orgLoading } = useOrg()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  if (loading || orgLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />
  }

  if (!orgId) {
    return <Navigate to="/org-select" replace />
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col min-h-0">
        {/* Top header bar */}
        <header className="flex h-14 items-center justify-end gap-2 border-b border-border/40 px-6 shrink-0">
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="text-sm text-muted-foreground max-w-[180px] truncate">
                  {user?.email}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-red-600 focus:text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden pl-2">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
