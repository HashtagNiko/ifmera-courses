import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Der gewählte Durchlauf gilt für die ganze App: im Tagebuch wird er gesetzt,
 * die Kachelansicht färbt danach ein. Beide Ansichten müssen denselben meinen,
 * sonst zeigt die eine grün, was in der anderen offen ist.
 *
 * Gemerkt wird die Wahl im Browser, damit sie einen Neustart übersteht.
 */
interface DurchlaufContextValue {
  durchlaufId: string | null
  setDurchlaufId: (id: string | null) => void
}

const SCHLUESSEL = 'ifmera.durchlauf'
const DurchlaufContext = createContext<DurchlaufContextValue | undefined>(undefined)

export function DurchlaufProvider({ children }: { children: ReactNode }) {
  const [durchlaufId, setId] = useState<string | null>(
    () => window.localStorage.getItem(SCHLUESSEL) || null,
  )

  function setDurchlaufId(id: string | null) {
    setId(id)
    if (id) window.localStorage.setItem(SCHLUESSEL, id)
    else window.localStorage.removeItem(SCHLUESSEL)
  }

  return (
    <DurchlaufContext.Provider value={{ durchlaufId, setDurchlaufId }}>
      {children}
    </DurchlaufContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDurchlauf() {
  const ctx = useContext(DurchlaufContext)
  if (!ctx) throw new Error('useDurchlauf muss innerhalb von <DurchlaufProvider> stehen')
  return ctx
}
