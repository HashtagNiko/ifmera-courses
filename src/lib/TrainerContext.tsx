import { createContext, useContext } from 'react'
import type { Trainer } from './trainer'

/**
 * Das Profil des Angemeldeten. Gesetzt wird es von `ProtectedRoute`, das den
 * Trainer-Bereich erst öffnet, wenn das Profil geladen und aktiv ist; innerhalb
 * des Bereichs ist es deshalb immer vorhanden.
 */
export const TrainerContext = createContext<Trainer | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useIch(): Trainer {
  const ich = useContext(TrainerContext)
  if (!ich) throw new Error('useIch muss innerhalb des Trainer-Bereichs stehen')
  return ich
}
