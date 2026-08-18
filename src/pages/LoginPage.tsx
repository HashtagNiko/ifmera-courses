import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

export default function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setBusy(true)
    try {
      const { error } = await signIn(email, passwort)
      if (error) setFehler(uebersetzeFehler(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full bg-ifm-cream flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8">
        <img src="/logo.png" alt="ifmera academy" className="mb-6 h-9 w-auto" />

        <h1 className="text-2xl font-bold text-ifm-blue">Anmelden</h1>
        <p className="mt-1 text-sm text-ifm-gray">Kurse · Trainer-Bereich</p>

        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-lg bg-ifm-yellow/20 text-ifm-blue text-sm p-3">
            Supabase ist nicht konfiguriert. Bitte <code>.env</code> ausfüllen.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="E-Mail" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field
            label="Passwort"
            type="password"
            value={passwort}
            onChange={setPasswort}
            autoComplete="current-password"
          />

          {fehler && (
            <p className="rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-ifm-blue text-white px-4 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {busy ? 'Einen Moment …' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ifm-blue">{label}</span>
      <input
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ifm-lightblue px-3 py-2 text-sm outline-none focus:border-ifm-blue"
      />
    </label>
  )
}

/** Supabase antwortet englisch; die häufigsten Fälle übersetzen wir. */
function uebersetzeFehler(meldung: string): string {
  if (/invalid login credentials/i.test(meldung)) return 'E-Mail oder Passwort stimmt nicht.'
  if (/email not confirmed/i.test(meldung)) return 'Die E-Mail-Adresse ist noch nicht bestätigt.'
  return meldung
}
