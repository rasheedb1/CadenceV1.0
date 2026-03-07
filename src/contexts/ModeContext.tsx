import { createContext, useContext, useState, useCallback } from 'react'

export type AppMode = 'sdr' | 'ae'

interface ModeContextValue {
  mode: AppMode
  setMode: (mode: AppMode) => void
}

const ModeContext = createContext<ModeContextValue>({
  mode: 'sdr',
  setMode: () => {},
})

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(() => {
    return (localStorage.getItem('app_mode') as AppMode) || 'sdr'
  })

  const setMode = useCallback((newMode: AppMode) => {
    setModeState(newMode)
    localStorage.setItem('app_mode', newMode)
  }, [])

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  return useContext(ModeContext)
}
