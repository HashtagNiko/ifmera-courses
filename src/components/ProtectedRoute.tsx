import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { eigenesProfilLaden, type Trainer } from '../lib/trainer'
import { TrainerContext } from '../lib/TrainerContext'

/**
 * Schützt den Trainer-Bereich zweifach: ohne Sitzung geht es auf /login, und
 * eine Sitzung allein genügt nicht. Das Supabase-Projekt teilen wir mit dem
 * Prüfungstool, in dem auch andere Trainer Konten haben; hereinkommen darf nur,
 * wer in `kt_trainer` steht und aktiv ist. Die Prüfung hier ist die
 * Bequemlichkeit, die Absicherung liegt in den Regeln der Datenbank.
 */
export default function ProtectedRoute() {
  const { session, loading, signOut } = useAuth()
  // undefined = lädt noch, null = kein Profil
  const [profil, setProfil] = useState<Trainer | null | undefined>(undefined)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!session) {
      setProfil(undefined)
      return
    }
    let aktiv = true
    eigenesProfilLaden(session.user.id)
      .then((p) => {
        if (aktiv) setProfil(p)
      })
      .catch((e: Error) => {
        if (!aktiv) return
        setFehler(e.message)
        setProfil(null)
      })
    return () => {
      aktiv = false
    }
  }, [session])

  if (loading) return <Ladehinweis />
  if (!session) return <Navigate to="/login" replace />
  if (profil === undefined) return <Ladehinweis />

  if (!profil || !profil.aktiv) {
    return (
      <div className="min-h-full bg-ifm-cream flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <h1 className="text-xl font-bold text-ifm-blue">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-ifm-gray">
            {profil && !profil.aktiv
              ? 'Dieses Konto ist für die Trainer-Oberfläche abgeschaltet.'
              : 'Dieses Konto ist für die Trainer-Oberfläche nicht freigeschaltet.'}
          </p>
          {fehler && <p className="mt-2 text-xs text-ifm-gray">({fehler})</p>}
          <button
            onClick={signOut}
            className="mt-6 rounded-lg bg-ifm-blue text-white px-4 py-2 text-sm font-medium"
          >
            Abmelden
          </button>
        </div>
      </div>
    )
  }

  return (
    <TrainerContext.Provider value={profil}>
      <Outlet />
    </TrainerContext.Provider>
  )
}

function Ladehinweis() {
  return <div className="min-h-full flex items-center justify-center text-ifm-gray">Lädt …</div>
}
