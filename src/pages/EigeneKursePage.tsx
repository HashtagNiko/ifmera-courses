import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Kopfzeile from '../components/Kopfzeile'
import { dateiHerunterladen } from '../lib/kurse'
import {
  KURSNAME_MAX,
  STARTPAKET_BUCKET,
  STARTPAKET_NAME,
  STARTPAKET_PFAD,
  eigeneKurseLaden,
  kursAnlegen,
  kursnamePruefen,
  type EigenerKurs,
} from '../lib/eigeneKurse'
import { useIch } from '../lib/TrainerContext'

/**
 * Eigene Kurse (SPEC.md, Baustein 10): Startpaket für Claude laden, neuen Kurs anlegen, eigene Kurse
 * bearbeiten. Ein neuer Kurs gehört nur dem, der ihn anlegt; andere sehen ihn erst nach einer Freigabe.
 */
export default function EigeneKursePage() {
  const ich = useIch()
  const navigate = useNavigate()
  const [kurse, setKurse] = useState<EigenerKurs[]>([])
  const [name, setName] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [gesperrt, setGesperrt] = useState(false)

  useEffect(() => {
    eigeneKurseLaden(ich.id)
      .then(setKurse)
      .catch((e: Error) => setFehler(e.message))
      .finally(() => setLaedt(false))
  }, [ich.id])

  async function anlegen() {
    const f = kursnamePruefen(name)
    if (f) {
      setFehler(f)
      return
    }
    setGesperrt(true)
    setFehler(null)
    try {
      const kurs = await kursAnlegen(ich.id, name)
      navigate(`/eigene-kurse/${kurs.id}`)
    } catch (e) {
      setFehler((e as Error).message)
      setGesperrt(false)
    }
  }

  async function startpaketLaden() {
    setGesperrt(true)
    setFehler(null)
    try {
      await dateiHerunterladen(STARTPAKET_PFAD, STARTPAKET_NAME, undefined, undefined, STARTPAKET_BUCKET)
    } catch {
      setFehler('Das Startpaket liegt gerade nicht bereit. Bitte später noch einmal versuchen.')
    } finally {
      setGesperrt(false)
    }
  }

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Eigene Kurse" />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6 text-sm text-ifm-blue">
        {fehler && <p className="rounded-lg bg-ifm-red/15 p-3">{fehler}</p>}

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold">So entsteht ein eigener Kurs</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              „Startpaket herunterladen“ und das Zip Claude geben (Claude-App oder Claude Code). Claude plant mit dir
              Thema, Zielgruppe und Kurstage und baut die Decks.
            </li>
            <li>Hier den Kurs anlegen („Kurs anlegen“), dann je Kurstag „Tag anlegen“.</li>
            <li>
              Je Tag „Dateien hochladen“: das gebaute Deck aus dist/, den Ordner des Tages als Zip und, falls
              vorhanden, das PDF. Die Teilnehmerfassung macht das Tool selbst.
            </li>
            <li>Den Kurs sieht nur du, bis du ihn unter „Freigaben“ anderen Trainern freigibst.</li>
          </ol>
          <button
            onClick={() => void startpaketLaden()}
            disabled={gesperrt}
            className="mt-4 rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Startpaket herunterladen
          </button>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold">Neuen Kurs anlegen</h2>
          <label className="block">
            <span className="text-xs font-medium text-ifm-gray">Kursname (z. B. „Brandschutz in der Verwaltung“)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) void anlegen()
              }}
              maxLength={KURSNAME_MAX}
              className="mt-1 w-full rounded-lg border border-ifm-lightblue p-2"
            />
          </label>
          <button
            onClick={() => void anlegen()}
            disabled={gesperrt || !name.trim()}
            className="mt-3 rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Kurs anlegen
          </button>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold">Meine Kurse</h2>
          {laedt ? (
            <p className="text-ifm-gray">Lädt …</p>
          ) : kurse.length === 0 ? (
            <p className="text-ifm-gray">Du hast noch keinen eigenen Kurs angelegt.</p>
          ) : (
            <ul className="divide-y divide-ifm-lightblue">
              {kurse.map((k) => (
                <li key={k.id} className="flex items-center gap-3 py-2">
                  <span className="font-medium">{k.name}</span>
                  <Link
                    to={`/eigene-kurse/${k.id}`}
                    className="ml-auto font-medium underline-offset-2 hover:underline"
                  >
                    Kurs bearbeiten
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
