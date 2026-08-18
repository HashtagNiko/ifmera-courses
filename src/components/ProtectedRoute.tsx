import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { hatZugriff } from '../lib/kurse'

/**
 * Schützt den Trainer-Bereich zweifach: ohne Sitzung geht es auf /login, und
 * eine Sitzung allein genügt nicht. Das Supabase-Projekt teilen wir mit dem
 * Prüfungstool, in dem auch andere Trainer Konten haben; hier hereinkommen darf
 * nur, wer in `kurs_zugriff` steht. Die Prüfung hier ist die Bequemlichkeit,
 * die Absicherung liegt in den RLS-Policies.
 */
export default function ProtectedRoute() {
  const { session, loading, signOut } = useAuth()
  const [zugriff, setZugriff] = useState<boolean | null>(null)

  useEffect(() => {
    if (!session) {
      setZugriff(null)
      return
    }
    let aktiv = true
    hatZugriff().then((ok) => {
      if (aktiv) setZugriff(ok)
    })
    return () => {
      aktiv = false
    }
  }, [session])

  if (loading) return <Ladehinweis />
  if (!session) return <Navigate to="/login" replace />
  if (zugriff === null) return <Ladehinweis />

  if (!zugriff) {
    return (
      <div className="min-h-full bg-ifm-cream flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <h1 className="text-xl font-bold text-ifm-blue">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-ifm-gray">
            Dieses Konto ist für die Trainer-Oberfläche nicht freigeschaltet.
          </p>
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

  return <Outlet />
}

function Ladehinweis() {
  return <div className="min-h-full flex items-center justify-center text-ifm-gray">Lädt …</div>
}
