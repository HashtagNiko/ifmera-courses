import { useState, type FormEvent } from 'react'
import Kopfzeile from '../components/Kopfzeile'
import { useAuth } from '../lib/AuthContext'
import { useIch, useProfilAktualisieren } from '../lib/TrainerContext'
import { NAME_MAX, PASSWORT_MIN, anzeigenameSetzen, namePruefen, passwortAendern, passwortPruefen } from '../lib/profil'

/** Profil (Baustein 8): eigenen Anzeigenamen und eigenes Passwort ändern. */
export default function ProfilPage() {
  const ich = useIch()
  const { user } = useAuth()
  const aktualisieren = useProfilAktualisieren()
  const email = user?.email ?? ''

  const [name, setName] = useState(ich.anzeigename)
  const [nameStatus, setNameStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [nameArbeitet, setNameArbeitet] = useState(false)

  const [alt, setAlt] = useState('')
  const [neu, setNeu] = useState('')
  const [wiederholt, setWiederholt] = useState('')
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwArbeitet, setPwArbeitet] = useState(false)

  async function nameSpeichern(e: FormEvent) {
    e.preventDefault()
    setNameStatus(null)
    const fehler = namePruefen(name)
    if (fehler) return setNameStatus({ ok: false, text: fehler })
    setNameArbeitet(true)
    try {
      const gespeichert = await anzeigenameSetzen(name)
      aktualisieren({ anzeigename: gespeichert })
      setName(gespeichert)
      setNameStatus({ ok: true, text: 'Name gespeichert ✓' })
    } catch (err) {
      setNameStatus({ ok: false, text: (err as Error).message })
    } finally {
      setNameArbeitet(false)
    }
  }

  async function passwortSpeichern(e: FormEvent) {
    e.preventDefault()
    setPwStatus(null)
    const fehler = passwortPruefen(neu, wiederholt, alt)
    if (fehler) return setPwStatus({ ok: false, text: fehler })
    setPwArbeitet(true)
    try {
      await passwortAendern(email, alt, neu)
      setAlt('')
      setNeu('')
      setWiederholt('')
      setPwStatus({ ok: true, text: 'Passwort geändert ✓ Ab jetzt meldest du dich mit dem neuen an.' })
    } catch (err) {
      setPwStatus({ ok: false, text: (err as Error).message })
    } finally {
      setPwArbeitet(false)
    }
  }

  const feld = 'mt-1 w-full rounded-lg border border-ifm-lightblue px-3 py-2 outline-none focus:border-ifm-blue'

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Profil" />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6 text-sm text-ifm-blue">
        <form onSubmit={nameSpeichern} className="rounded-xl bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-base font-bold">Name</h2>
          <p className="text-ifm-gray">
            So siehst du andere Trainer im Tool, und so steht dein Name in der Fußzeile, wenn du Decks anderer
            Trainer öffnest oder herunterlädst, zum Beispiel „Herr Muster“. In deinen eigenen Decks steht weiter
            der Name aus deinen Kursdateien.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-ifm-gray">Anzeigename</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} className={feld} />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={nameArbeitet || name.trim() === ich.anzeigename}
              className="rounded-lg bg-ifm-blue px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              Name speichern
            </button>
            {nameStatus && <span className={nameStatus.ok ? 'text-ifm-green' : 'text-ifm-red'}>{nameStatus.text}</span>}
          </div>
        </form>

        <form onSubmit={passwortSpeichern} className="rounded-xl bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-base font-bold">Passwort</h2>
          <p className="text-ifm-gray">
            Angemeldet als <span className="text-ifm-blue">{email}</span>. Das Passwort gilt auch für das
            Prüfungstool, weil beide dieselbe Anmeldung nutzen. Mindestens {PASSWORT_MIN} Zeichen; gut merkbar sind
            drei Wörter und eine Zahl.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-ifm-gray">Bisheriges Passwort</span>
            <input type="password" autoComplete="current-password" value={alt} onChange={(e) => setAlt(e.target.value)} className={feld} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ifm-gray">Neues Passwort</span>
            <input type="password" autoComplete="new-password" value={neu} onChange={(e) => setNeu(e.target.value)} className={feld} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ifm-gray">Neues Passwort wiederholen</span>
            <input
              type="password"
              autoComplete="new-password"
              value={wiederholt}
              onChange={(e) => setWiederholt(e.target.value)}
              className={feld}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pwArbeitet || !alt || !neu || !wiederholt}
              className="rounded-lg bg-ifm-blue px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              Passwort ändern
            </button>
            {pwStatus && <span className={pwStatus.ok ? 'text-ifm-green' : 'text-ifm-red'}>{pwStatus.text}</span>}
          </div>
        </form>
      </main>
    </div>
  )
}
