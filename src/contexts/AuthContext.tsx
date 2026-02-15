import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

interface ProfileState {
  onboarding_completed: boolean
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: ProfileState | null
  loading: boolean
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
  const [profileLoading, setProfileLoading] = useState(false)

  // Fetch profile when user changes
  useEffect(() => {
    if (!user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }

    setProfileLoading(true)
    supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setProfile({
          onboarding_completed: data?.onboarding_completed ?? false,
        })
        setProfileLoading(false)
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
  const loading = authLoading || (!!user && profileLoading)

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, completeOnboarding }}>
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
