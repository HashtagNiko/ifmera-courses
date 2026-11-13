import { useCallback, useEffect, useState } from 'react'
import Kopfzeile from '../components/Kopfzeile'
import { kurseLaden, type Kurs } from '../lib/kurse'
import { useIch } from '../lib/TrainerContext'
import {
  STUFEN,
  freigabeEntfernen,
  freigabeSetzen,
  freigabenLaden,
  trainerLaden,
  type Freigabe,
  type Stufe,
  type Trainer,
} from '../lib/trainer'

/**
 * Freigaben verwalten: Der Besitzer eines Kurses legt fest, welcher Trainer ihn
 * nutzen darf und wie weit (SPEC.md, Baustein 1). Ändern kann ein anderer
 * Trainer einen fremden Kurs nie, egal mit welcher Stufe; das setzt die
 * Datenbank durch.
 */
export default function FreigabenPage() {
  const ich = useIch()
  const [kurse, setKurse] = useState<Kurs[]>([])
  const [andere, setAndere] = useState<Trainer[]>([])
  const [freigaben, setFreigaben] = useState<Freigabe[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [arbeitet, setArbeitet] = useState(false)

  const neuLaden = useCallback(async () => {
    const [alleKurse, alleTrainer] = await Promise.all([kurseLaden(), trainerLaden()])
    const eigene = alleKurse.filter((k) => k.besitzer_id === ich.id)
    setKurse(eigene)
    setAndere(alleTrainer.filter((t) => t.id !== ich.id && t.aktiv))
    setFreigaben(await freigabenLaden(eigene.map((k) => k.id)))
  }, [ich.id])

  useEffect(() => {
    neuLaden()
      .catch((e: Error) => setFehler(e.message))
      .finally(() => setLaedt(false))
  }, [neuLaden])

  async function ausfuehren(schritt: () => Promise<void>) {
    setFehler(null)
    setArbeitet(true)
    try {
      await schritt()
      await neuLaden()
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setArbeitet(false)
    }
  }

  const name = (id: string) => andere.find((t) => t.id === id)?.anzeigename ?? 'Unbekannter Trainer'

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Freigaben" />

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <section className="rounded-xl bg-white p-5 shadow-sm text-sm text-ifm-blue">
          <p>
            Hier legst du fest, welcher Trainer welchen deiner Kurse nutzen darf. Verändern kann er
            deinen Kurs nie, egal mit welcher Stufe.
          </p>
          <ul className="mt-3 space-y-1 text-ifm-gray">
            {STUFEN.map((s) => (
              <li key={s.wert}>
                <span className="font-medium text-ifm-blue">{s.name}:</span> {s.erklaerung}
              </li>
            ))}
          </ul>
        </section>

        {fehler && <p className="rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>}

        {!laedt && andere.length === 0 && (
          <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Noch kein weiterer Trainer freigeschaltet. Sobald einer dazukommt, kannst du ihm hier
            Kurse freigeben.
          </p>
        )}

        {!laedt && kurse.length === 0 && (
          <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Dir gehört noch kein Kurs.
          </p>
        )}

        {kurse.map((kurs) => (
          <KursFreigaben
            key={kurs.id}
            kurs={kurs}
            freigaben={freigaben.filter((f) => f.kurs_id === kurs.id)}
            andere={andere}
            name={name}
            gesperrt={arbeitet}
            setzen={(trainerId, stufe) => ausfuehren(() => freigabeSetzen(kurs.id, trainerId, stufe))}
            entfernen={(trainerId) => {
              if (!window.confirm(`Freigabe von „${kurs.name}“ für ${name(trainerId)} entfernen?`)) return
              ausfuehren(() => freigabeEntfernen(kurs.id, trainerId))
            }}
          />
        ))}
      </main>
    </div>
  )
}

function KursFreigaben({
  kurs,
  freigaben,
  andere,
  name,
  gesperrt,
  setzen,
  entfernen,
}: {
  kurs: Kurs
  freigaben: Freigabe[]
  andere: Trainer[]
  name: (id: string) => string
  gesperrt: boolean
  setzen: (trainerId: string, stufe: Stufe) => void
  entfernen: (trainerId: string) => void
}) {
  const offen = andere.filter((t) => !freigaben.some((f) => f.trainer_id === t.id))
  const [neuTrainer, setNeuTrainer] = useState('')
  const [neuStufe, setNeuStufe] = useState<Stufe>('nutzen')

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-bold text-ifm-blue">{kurs.name}</h2>

      {freigaben.length === 0 ? (
        <p className="mt-2 text-sm text-ifm-gray">Nur für dich sichtbar.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ifm-lightblue">
          {freigaben.map((f) => (
            <li key={f.trainer_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-40 font-medium text-ifm-blue">{name(f.trainer_id)}</span>
              <StufenAuswahl
                wert={f.stufe}
                gesperrt={gesperrt}
                onChange={(stufe) => setzen(f.trainer_id, stufe)}
              />
              <button
                onClick={() => entfernen(f.trainer_id)}
                disabled={gesperrt}
                className="ml-auto text-ifm-gray hover:text-ifm-red disabled:opacity-50"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      {offen.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ifm-lightblue pt-4 text-sm">
          <select
            value={neuTrainer}
            onChange={(e) => setNeuTrainer(e.target.value)}
            disabled={gesperrt}
            className="rounded-lg border border-ifm-lightblue px-2 py-1.5 text-ifm-blue"
          >
            <option value="">Trainer wählen …</option>
            {offen.map((t) => (
              <option key={t.id} value={t.id}>
                {t.anzeigename}
              </option>
            ))}
          </select>
          <StufenAuswahl wert={neuStufe} gesperrt={gesperrt} onChange={setNeuStufe} />
          <button
            onClick={() => {
              setzen(neuTrainer, neuStufe)
              setNeuTrainer('')
              setNeuStufe('nutzen')
            }}
            disabled={gesperrt || !neuTrainer}
            className="rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Freigeben
          </button>
        </div>
      )}
    </section>
  )
}

function StufenAuswahl({
  wert,
  gesperrt,
  onChange,
}: {
  wert: Stufe
  gesperrt: boolean
  onChange: (stufe: Stufe) => void
}) {
  return (
    <select
      value={wert}
      onChange={(e) => onChange(e.target.value as Stufe)}
      disabled={gesperrt}
      className="rounded-lg border border-ifm-lightblue px-2 py-1.5 text-ifm-blue"
    >
      {STUFEN.map((s) => (
        <option key={s.wert} value={s.wert}>
          {s.name}
        </option>
      ))}
    </select>
  )
}
