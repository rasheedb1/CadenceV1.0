import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

interface ProfileState {
  onboarding_completed: boolean
  current_org_id: string | null
  is_super_admin: boolean
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: ProfileState | null
  loading: boolean
  isSuperAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  completeOnboarding: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileState | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Fetch profile when user changes
  useEffect(() => {
    if (!user) {
      setProfile(null)
      return
    }

    supabase
      .from('profiles')
      .select('onboarding_completed, current_org_id, is_super_admin')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setProfile({
          onboarding_completed: data?.onboarding_completed ?? false,
          current_org_id: data?.current_org_id ?? null,
          is_super_admin: data?.is_super_admin ?? false,
        })
      })
  }, [user?.id])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const completeOnboarding = async () => {
    if (!user) return
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('user_id', user.id)
    setProfile(prev => prev ? { ...prev, onboarding_completed: true } : prev)
  }

  // Loading = true until auth AND profile are resolved
  // Use !profile (not profileLoading) to prevent race condition where authLoading
  // becomes false and user is set, but profileLoading hasn't been set to true yet
  const loading = authLoading || (!!user && !profile)
  const isSuperAdmin = profile?.is_super_admin ?? false

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, isSuperAdmin, signIn, signUp, signOut, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
