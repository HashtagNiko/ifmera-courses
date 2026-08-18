import { useEffect, useState } from 'react'
import { deckOeffnen } from '../lib/deckOeffnen'
import Kopfzeile from '../components/Kopfzeile'
import { kurseLaden, kurstageLaden, type Kurs, type Kurstag } from '../lib/kurse'
import { durchlaeufeLaden, vermitteltIds } from '../lib/tagebuch'
import { useDurchlauf } from '../lib/DurchlaufContext'

/** Kurstag mit dem Segment, unter dem er einsortiert wird. */
type TagImSegment = Kurstag & { segmentEffektiv: number }

export default function DashboardPage() {
  const [kurse, setKurse] = useState<Kurs[]>([])
  const [aktiverKurs, setAktiverKurs] = useState<string | null>(null)
  const [tage, setTage] = useState<TagImSegment[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)
  const { durchlaufId } = useDurchlauf()
  const [vermittelt, setVermittelt] = useState<Set<string>>(new Set())
  const [durchlaufName, setDurchlaufName] = useState<string | null>(null)

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
      .then((alle) => setTage(einsortieren(alle)))
      .catch((e: Error) => setFehler(e.message))
  }, [aktiverKurs])

  // Grün markiert wird immer der Stand des Durchlaufs, der im Tagebuch gewählt
  // ist. Sein Name steht mit dabei, sonst wäre unklar, worauf sich Grün bezieht.
  useEffect(() => {
    if (!durchlaufId) {
      setVermittelt(new Set())
      setDurchlaufName(null)
      return
    }
    vermitteltIds(durchlaufId)
      .then(setVermittelt)
      .catch((e: Error) => setFehler(e.message))
  }, [durchlaufId, tage])

  useEffect(() => {
    if (!aktiverKurs || !durchlaufId) return
    durchlaeufeLaden(aktiverKurs)
      .then((d) => setDurchlaufName(d.find((x) => x.id === durchlaufId)?.name ?? null))
      .catch(() => setDurchlaufName(null))
  }, [aktiverKurs, durchlaufId])

  const segmente = [...new Set(tage.map((t) => t.segmentEffektiv))].sort((a, b) => a - b)

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Kurstage" />

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

        {durchlaufName && (
          <p className="mb-6 text-sm text-ifm-gray">
            Grün markiert: im Durchlauf <span className="text-ifm-blue">{durchlaufName}</span>{' '}
            bereits vermittelt ({tage.filter((t) => vermittelt.has(t.id)).length} von {tage.length})
          </p>
        )}

        {fehler && <p className="rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>}

        {!fehler && !laedt && tage.length === 0 && (
          <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Noch keine Kurstage angelegt. Nach dem ersten Deck-Sync erscheinen sie hier.
          </p>
        )}

        {segmente.map((seg) => (
          <section key={seg} className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ifm-gray mb-3">
              {segmentUeberschrift(tage, seg)}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tage
                .filter((t) => t.segmentEffektiv === seg)
                .map((t) => (
                  <Kachel key={t.id} tag={t} vermittelt={vermittelt.has(t.id)} />
                ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

/**
 * Ordnet jedem Tag ein Segment zu. Projekttage und die Abschlussprüfung tragen
 * selbst keines; sie erben es vom Kurstag davor, damit sie an der Stelle stehen,
 * an der sie im Kurs auch vorkommen (Projekttag 1 zwischen Tag 4 und Tag 5).
 * Voraussetzung ist die Sortierung nach `position`, die der Import setzt.
 */
function einsortieren(tage: Kurstag[]): TagImSegment[] {
  let letztes = 0
  return tage.map((t) => {
    if (t.segment) letztes = t.segment
    return { ...t, segmentEffektiv: t.segment ?? letztes }
  })
}

/**
 * Überschrift eines Segments: der Name aus dem Deck-Titel, etwa
 * "Segment 2 · Rechtliche Grundlagen". Solange kein Name vorliegt (Deck noch
 * nicht synchronisiert), bleibt es bei der Nummer.
 */
function segmentUeberschrift(tage: TagImSegment[], segment: number): string {
  const name = tage.find((t) => t.segmentEffektiv === segment && t.segment_titel)?.segment_titel
  if (!segment) return name ?? 'Ohne Segment'
  return name ? `Segment ${segment} · ${name}` : `Segment ${segment}`
}

/**
 * Farbgebung: Kurstage sind weiß, Projekttage teal, die Abschlussprüfung
 * bernstein. Ist der Tag im gewählten Durchlauf vermittelt, wechselt er auf
 * Grün, und zwar in der Abstufung seiner Art, damit die Unterscheidung auch im
 * abgehakten Zustand bestehen bleibt. Das Häkchen trägt die Aussage mit, falls
 * jemand die Farben schlecht unterscheidet.
 */
const FARBEN: Record<Kurstag['art'], { offen: string; erledigt: string }> = {
  kurstag: {
    offen: 'bg-white border-transparent',
    erledigt: 'bg-ifm-green/12 border-ifm-green/45',
  },
  projekttag: {
    offen: 'bg-ifm-lightblue border-ifm-lightblue',
    erledigt: 'bg-ifm-green/30 border-ifm-green/60',
  },
  pruefung: {
    offen: 'bg-ifm-yellow/25 border-ifm-yellow/40',
    erledigt: 'bg-ifm-green/45 border-ifm-green/70',
  },
}

function Kachel({ tag, vermittelt }: { tag: TagImSegment; vermittelt: boolean }) {
  const inhalt = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-ifm-gray">
        {bezeichnung(tag)}
        {vermittelt && (
          <span className="text-ifm-green" title="bereits vermittelt">
            ✓
          </span>
        )}
      </span>
      <span className="mt-1 block font-medium text-ifm-blue">
        {tag.titel ?? tag.tagebuch_titel ?? 'Ohne Titel'}
      </span>
      <span className="mt-3 block text-xs text-ifm-gray">
        {tag.deck_pfad
          ? `Stand ${formatiereDatum(tag.deck_aktualisiert_am)}`
          : 'kein Deck, Themen im Tagebuch'}
      </span>
    </>
  )

  const farbe = FARBEN[tag.art] ?? FARBEN.kurstag
  const klassen = `block w-full text-left rounded-xl p-4 shadow-sm border ${
    vermittelt ? farbe.erledigt : farbe.offen
  }`

  if (!tag.deck_pfad) {
    return <div className={klassen}>{inhalt}</div>
  }

  return (
    <button
      onClick={() => deckOeffnen(tag.deck_pfad!, bezeichnung(tag))}
      className={`${klassen} hover:border-ifm-red transition-colors cursor-pointer`}
    >
      {inhalt}
    </button>
  )
}

function bezeichnung(tag: Kurstag): string {
  if (tag.art === 'pruefung') return 'Abschlussprüfung'
  if (tag.art === 'projekttag') return `Projekttag ${tag.nummer}`
  return `Tag ${tag.nummer}`
}

function formatiereDatum(iso: string | null): string {
  if (!iso) return 'unbekannt'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
