import { useEffect, useRef } from 'react'
import { Outlet, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Sidebar } from './Sidebar'
import { AppHeader } from './AppHeader'
import { FloatingActionButton } from '@/components/FloatingActionButton'
import { LogOut, Moon, Sun, Settings } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function MainLayout() {
  const { user, profile, loading, session, signOut } = useAuth()
  const { orgId, isLoading: orgLoading } = useOrg()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const googleCallbackProcessed = useRef(false)

  // ── Google OAuth callback handler ────────────────────────────────────────────
  // Lives here (not in AccountExecutive) so it runs regardless of feature flags.
  // FeatureRoute may block /account-executive for users without that flag,
  // but MainLayout always renders for authenticated users.
  useEffect(() => {
    if (googleCallbackProcessed.current) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const calendarParam = params.get('calendar')
    const state = params.get('state')
    if (!code || calendarParam !== 'connected') return

    // Wait for session — do NOT set ref yet so this re-runs when session loads
    if (!session?.access_token) return

    googleCallbackProcessed.current = true
    // Clear the OAuth params from the URL immediately to prevent duplicate processing
    window.history.replaceState({}, '', window.location.pathname)

    const token = session.access_token
    const origin = sessionStorage.getItem('gmailOAuthOrigin') || '/settings'
    sessionStorage.removeItem('gmailOAuthOrigin')

    toast.loading('Conectando cuenta de Google...')
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ae-google-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, state }),
    })
      .then(r => r.json())
      .then(result => {
        toast.dismiss()
        if (result.error) {
          toast.error('Error al conectar Google: ' + result.error)
        } else {
          toast.success('Google conectado' + (result.email ? ' como ' + result.email : '') + '!')
        }
        navigate(origin)
      })
      .catch(() => {
        toast.dismiss()
        toast.error('Error al conectar Google')
        navigate(origin)
      })
  }, [session?.access_token, navigate])

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
            aria-label={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
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
                Configuración
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-red-600 focus:text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <AppHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pl-2">
          <Outlet />
        </main>
        <FloatingActionButton />
      </div>
    </div>
  )
}
