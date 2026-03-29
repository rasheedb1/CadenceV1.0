import { Navigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { SolarNavigation } from '@/components/solar/SolarNavigation'

export function AppLauncher() {
  const { user, profile } = useAuth()
  const { org } = useOrg()

  if (!user) return <Navigate to="/auth" replace />
  if (user && profile && !profile.onboarding_completed) return <Navigate to="/onboarding" replace />

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg logo-gradient text-white text-sm font-bold">C</div>
            <span className="font-heading font-semibold text-lg">Chief</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {org?.name || 'Mi Organización'}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-col items-center justify-center px-6" style={{ minHeight: 'calc(100vh - 57px)' }}>
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
        >
          <h1 className="text-2xl font-bold font-heading tracking-tight">
            Bienvenido a Chief
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Selecciona un módulo para comenzar
          </p>
        </motion.div>

        <SolarNavigation />
      </main>
    </div>
  )
}
