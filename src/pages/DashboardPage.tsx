import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deckOeffnen } from '../lib/deckOeffnen'
import Kopfzeile from '../components/Kopfzeile'
import KeinKurs from '../components/KeinKurs'
import {
  dateiHerunterladen,
  downloadName,
  kurseLaden,
  kurstageLaden,
  type Kurs,
  type Kurstag,
} from '../lib/kurse'
import { durchlaeufeLaden, vermitteltIds } from '../lib/tagebuch'
import { fassungenZaehlen } from '../lib/fassungen'
import { useDurchlauf } from '../lib/DurchlaufContext'
import { useIch } from '../lib/TrainerContext'
import { darfFassung, darfNotizen, meineStufenLaden, trainerLaden, type Stufe } from '../lib/trainer'
import type { DeckAnpassung } from '../lib/deckAnpassung'

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
  const ich = useIch()
  const [namen, setNamen] = useState<Map<string, string>>(new Map())

  const [stufen, setStufen] = useState<Map<string, Stufe>>(new Map())
  const [fassungsZahl, setFassungsZahl] = useState<Map<string, number>>(new Map())

  // Wie viele Fassungen man zu jedem Tag sehen darf (eigene und freigegebene)
  useEffect(() => {
    fassungenZaehlen(tage.map((t) => t.id))
      .then(setFassungsZahl)
      .catch(() => setFassungsZahl(new Map()))
  }, [tage])

  // Namen der anderen Trainer, für den Hinweis bei freigegebenen Kursen,
  // und die eigenen Stufen (wer bei fremden Kursen Notizen schreiben darf)
  useEffect(() => {
    trainerLaden()
      .then((t) => setNamen(new Map(t.map((x) => [x.id, x.anzeigename]))))
      .catch(() => setNamen(new Map()))
    meineStufenLaden(ich.id)
      .then(setStufen)
      .catch(() => setStufen(new Map()))
  }, [ich.id])

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
  const kurs = kurse.find((k) => k.id === aktiverKurs)
  const fremderKurs = kurs && kurs.besitzer_id !== ich.id
  // Fremdes Deck: in der Fußzeile der eigenen Kopie steht der eigene Name (SPEC.md, Baustein 2)
  const anpassung: DeckAnpassung =
    fremderKurs && kurs ? { fussName: { von: namen.get(kurs.besitzer_id) ?? '', nach: ich.anzeigename } } : {}

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
                {k.besitzer_id !== ich.id && <span className="ml-1 opacity-70">*</span>}
              </button>
            ))}
          </div>
        )}

        {fremderKurs && (
          <p className="mb-6 text-sm text-ifm-gray">
            {kurse.length > 1 && '* '}
            Freigegeben von{' '}
            <span className="text-ifm-blue">{namen.get(kurs.besitzer_id) ?? 'einem anderen Trainer'}</span>.
            Du kannst ihn nutzen, aber nicht verändern.
          </p>
        )}

        {durchlaufName && (
          <p className="mb-6 text-sm text-ifm-gray">
            Grün markiert: im Durchlauf <span className="text-ifm-blue">{durchlaufName}</span>{' '}
            bereits vermittelt ({tage.filter((t) => vermittelt.has(t.id)).length} von {tage.length})
          </p>
        )}

        {fehler && <p className="rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>}

        {!fehler && !laedt && kurse.length === 0 && <KeinKurs />}

        {!fehler && !laedt && kurse.length > 0 && tage.length === 0 && (
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
                  <Kachel
                    key={t.id}
                    tag={t}
                    vermittelt={vermittelt.has(t.id)}
                    anpassung={anpassung}
                    notizen={Boolean(kurs && darfNotizen(kurs.besitzer_id, ich.id, stufen.get(kurs.id)))}
                    fassung={Boolean(kurs && darfFassung(kurs.besitzer_id, ich.id, stufen.get(kurs.id)))}
                    fassungen={fassungsZahl.get(t.id) ?? 0}
                  />
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

function Kachel({
  tag,
  vermittelt,
  anpassung,
  notizen,
  fassung,
  fassungen,
}: {
  tag: TagImSegment
  vermittelt: boolean
  anpassung: DeckAnpassung
  /** Darf der Angemeldete zu diesem Kurs eigene Notizen schreiben? */
  notizen: boolean
  /** Darf der Angemeldete Quellpakete laden (Stufe "fassung" oder Besitzer)? */
  fassung: boolean
  /** Anzahl sichtbarer Fassungen (eigene und freigegebene) zu diesem Tag */
  fassungen: number
}) {
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
  const rahmen = `flex flex-col rounded-xl shadow-sm border ${vermittelt ? farbe.erledigt : farbe.offen} ${
    tag.deck_pfad ? 'hover:border-ifm-red transition-colors' : ''
  }`

  const downloads = (
    [
      ['trainer', 'Trainer', 'Trainerfassung (HTML, mit Cockpit und Notizen)', tag.deck_pfad],
      ['teilnehmer', 'Teilnehmer', 'Teilnehmerfassung (HTML, ohne Notizen)', tag.teilnehmer_pfad],
      ['pdf', 'PDF', 'PDF der Teilnehmerfassung', tag.pdf_pfad],
      [
        'quellen',
        'Quellen',
        'Quellpaket zum Bearbeiten mit Claude (Folien, Bilder, Engine, Anleitung)',
        fassung ? tag.quellen_pfad : null,
      ],
    ] as const
  ).filter(([, , , pfad]) => pfad)

  return (
    <div className={rahmen}>
      {tag.deck_pfad ? (
        <button
          // Eigene Notizen nur, solange man sie auch schreiben darf (Stufe "notizen" oder Besitzer)
          onClick={() => deckOeffnen(tag.deck_pfad!, bezeichnung(tag), anpassung, notizen ? tag.id : undefined)}
          className="block w-full flex-1 text-left p-4 cursor-pointer"
        >
          {inhalt}
        </button>
      ) : (
        <div className="flex-1 p-4">{inhalt}</div>
      )}

      {downloads.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-ifm-blue/10 px-4 py-2 text-xs">
          <span className="text-ifm-gray">Herunterladen:</span>
          {downloads.map(([art, name, erklaerung, pfad]) => (
            <DownloadKnopf
              key={art}
              name={name}
              erklaerung={erklaerung}
              pfad={pfad!}
              dateiname={downloadName(tag, art)}
              anpassung={anpassung}
              // Die Trainerfassung nimmt die eigenen Notizen mit, das Cockpit zeigt sie auch offline
              kurstagId={art === 'trainer' && notizen ? tag.id : undefined}
            />
          ))}
          {notizen && tag.deck_pfad && (
            <Link
              to={`/notizen/${tag.id}`}
              className="ml-auto font-medium text-ifm-blue underline-offset-2 hover:underline"
              title="Eigene Notizen zu den Folien dieses Tages"
            >
              ✎ Notizen
            </Link>
          )}
          {(fassung || fassungen > 0) && tag.deck_pfad && (
            <Link
              to={`/fassungen/${tag.id}`}
              className={`${notizen ? '' : 'ml-auto '}font-medium text-ifm-blue underline-offset-2 hover:underline`}
              title="Eigene Fassungen dieses Tages: Quellpaket laden, bearbeitete Fassung hochladen, freigeben"
            >
              ⧉ Fassungen{fassungen > 0 ? ` (${fassungen})` : ''}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function DownloadKnopf({
  name,
  erklaerung,
  pfad,
  dateiname,
  anpassung,
  kurstagId,
}: {
  name: string
  erklaerung: string
  pfad: string
  dateiname: string
  anpassung: DeckAnpassung
  kurstagId?: string
}) {
  const ich = useIch()
  const [laedt, setLaedt] = useState(false)
  return (
    <button
      title={`${erklaerung}: ${dateiname}`}
      disabled={laedt}
      onClick={() => {
        setLaedt(true)
        // Unsichtbare Markierung, damit sich eine weitergegebene Kopie zuordnen lässt
        const markierung = `${ich.anzeigename}, heruntergeladen am ${new Date().toLocaleString('de-DE')} über courses.shnoozy.top`
        dateiHerunterladen(pfad, dateiname, { ...anpassung, markierung }, kurstagId)
          .catch((e: Error) => window.alert(`Herunterladen fehlgeschlagen: ${e.message}`))
          .finally(() => setLaedt(false))
      }}
      className="font-medium text-ifm-blue underline-offset-2 hover:underline disabled:opacity-50"
    >
      {laedt ? `${name} …` : name}
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
