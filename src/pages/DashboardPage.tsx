import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { kurseLaden, kurstageLaden, type Kurs, type Kurstag } from '../lib/kurse'

export default function DashboardPage() {
  const { signOut, user } = useAuth()
  const [kurse, setKurse] = useState<Kurs[]>([])
  const [aktiverKurs, setAktiverKurs] = useState<string | null>(null)
  const [tage, setTage] = useState<Kurstag[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)

  useEffect(() => {
    kurseLaden()
      .then((k) => {
        setKurse(k)
        setAktiverKurs((vorher) => vorher ?? k[0]?.id ?? null)
      })
      .catch((e: Error) => setFehler(e.message))
      .finally(() => setLaedt(false))
  }, [])

  useEffect(() => {
    if (!aktiverKurs) return
    kurstageLaden(aktiverKurs)
      .then(setTage)
      .catch((e: Error) => setFehler(e.message))
  }, [aktiverKurs])

  const segmente = [...new Set(tage.map((t) => t.segment ?? 0))].sort((a, b) => a - b)

  return (
    <div className="min-h-full bg-ifm-cream">
      <header className="bg-white border-b border-ifm-lightblue">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <img src="/logo.png" alt="ifmera academy" className="h-8 w-auto" />
          <div className="flex-1">
            <h1 className="text-lg font-bold text-ifm-blue">Kurstage</h1>
            <p className="text-xs text-ifm-gray">{user?.email}</p>
          </div>
          <button onClick={signOut} className="text-sm text-ifm-gray hover:text-ifm-blue">
            Abmelden
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {kurse.length > 1 && (
          <div className="mb-6 flex gap-2">
            {kurse.map((k) => (
              <button
                key={k.id}
                onClick={() => setAktiverKurs(k.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  k.id === aktiverKurs
                    ? 'bg-ifm-blue text-white'
                    : 'bg-white text-ifm-blue border border-ifm-lightblue'
                }`}
              >
                {k.name}
              </button>
            ))}
          </div>
        )}

        {fehler && (
          <p className="rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>
        )}

        {!fehler && !laedt && tage.length === 0 && (
          <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Noch keine Kurstage angelegt. Nach dem ersten Deck-Sync erscheinen sie hier.
          </p>
        )}

        {segmente.map((seg) => (
          <section key={seg} className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ifm-gray mb-3">
              Segment {seg || '–'}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tage
                .filter((t) => (t.segment ?? 0) === seg)
                .map((t) => (
                  <Kachel key={t.id} tag={t} />
                ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

function Kachel({ tag }: { tag: Kurstag }) {
  const inhalt = (
    <>
      <span className="text-xs font-medium text-ifm-gray">Tag {tag.nummer}</span>
      <span className="mt-1 block font-medium text-ifm-blue">{tag.titel ?? 'Ohne Titel'}</span>
      <span className="mt-3 block text-xs text-ifm-gray">
        {tag.deck_pfad
          ? `Stand ${formatiereDatum(tag.deck_aktualisiert_am)}`
          : 'Noch kein Deck hochgeladen'}
      </span>
    </>
  )

  const klassen = 'block rounded-xl bg-white p-4 shadow-sm border border-transparent'

  if (!tag.deck_pfad) {
    return <div className={`${klassen} opacity-60`}>{inhalt}</div>
  }

  return (
    <Link to={`/deck/${tag.id}`} className={`${klassen} hover:border-ifm-red transition-colors`}>
      {inhalt}
    </Link>
  )
}

function formatiereDatum(iso: string | null): string {
  if (!iso) return 'unbekannt'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
