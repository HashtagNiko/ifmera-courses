import { useCallback, useEffect, useRef, useState } from 'react'
import KeinKurs from '../components/KeinKurs'
import { kurseLaden, type Kurs } from '../lib/kurse'
import {
  durchlaeufeLaden,
  durchlaufAnlegen,
  hakenSetzen,
  kopiertext,
  mitwirkendeLaden,
  mitwirkendenAufnehmen,
  mitwirkendenAustragen,
  notizSpeichern,
  planFassungSetzen,
  planTrainerSetzen,
  standLaden,
  tageLaden,
  tagesBezeichnung,
  type Durchlauf,
  type TagebuchTag,
} from '../lib/tagebuch'
import { fassungenFuerTage, kursZugangVon, type Fassung } from '../lib/fassungen'
import { trainerLaden, type Trainer } from '../lib/trainer'
import { useIch } from '../lib/TrainerContext'
import Kopfzeile from '../components/Kopfzeile'
import { useDurchlauf } from '../lib/DurchlaufContext'

export default function TagebuchPage() {
  const [kurse, setKurse] = useState<Kurs[]>([])
  const [kursId, setKursId] = useState<string | null>(null)
  const [durchlaeufe, setDurchlaeufe] = useState<Durchlauf[]>([])
  const { durchlaufId, setDurchlaufId } = useDurchlauf()
  const [tage, setTage] = useState<TagebuchTag[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [neuOffen, setNeuOffen] = useState(false)

  const [kurseGeladen, setKurseGeladen] = useState(false)

  useEffect(() => {
    kurseLaden()
      .then((k) => {
        setKurse(k)
        setKursId((v) => v ?? k[0]?.id ?? null)
        setKurseGeladen(true)
      })
      .catch((e: Error) => setFehler(e.message))
  }, [])

  useEffect(() => {
    if (!kursId) return
    durchlaeufeLaden(kursId)
      .then((d) => {
        setDurchlaeufe(d)
        // Gemerkte Wahl behalten, solange es sie noch gibt.
        const gemerkt = d.find((x) => x.id === durchlaufId)
        if (!gemerkt) setDurchlaufId(d[0]?.id ?? null)
      })
      .catch((e: Error) => setFehler(e.message))
  }, [kursId])

  // ---- Speichern von Haken und Tagesnotiz ----
  // Letzter bekannter Stand je Durchlauf und Tag in der Datenbank: Grundlage, um beim Speichern der Notiz
  // zu erkennen, ob jemand anderes sie inzwischen geändert hat (gemeinsamer Durchlauf).
  const serverStand = useRef(new Map<string, { notiz: string; stand_am: string | null }>())
  // Speichern je Tag nacheinander, nie gleichzeitig (sonst kämen Anfragen in falscher Reihenfolge an)
  const ketten = useRef(new Map<string, Promise<void>>())
  // Zähler je Tag: steigt bei einem Konflikt; danach verworfene ältere Speicheraufträge
  const konflikte = useRef(new Map<string, number>())
  const [zurueckgesetzt, setZurueckgesetzt] = useState<Map<string, number>>(new Map())
  const aktuellerDurchlauf = useRef(durchlaufId)
  useEffect(() => {
    aktuellerDurchlauf.current = durchlaufId
  }, [durchlaufId])

  const tageUebernehmen = useCallback((dlId: string | null, neu: TagebuchTag[]) => {
    if (dlId) for (const t of neu) serverStand.current.set(`${dlId}:${t.id}`, { notiz: t.notiz, stand_am: t.stand_am })
    if (dlId === aktuellerDurchlauf.current) setTage(neu)
  }, [])

  useEffect(() => {
    if (!kursId) return
    tageLaden(kursId, durchlaufId)
      .then((neu) => tageUebernehmen(durchlaufId, neu))
      .catch((e: Error) => setFehler(e.message))
  }, [kursId, durchlaufId, tageUebernehmen])

  function einreihen(schluessel: string, schritt: () => Promise<void>): Promise<void> {
    const jetzt = (ketten.current.get(schluessel) ?? Promise.resolve()).then(schritt).catch((e: Error) => setFehler(e.message))
    ketten.current.set(schluessel, jetzt)
    return jetzt
  }

  function tagAktualisieren(dlId: string, tagId: string, felder: Partial<TagebuchTag>) {
    if (dlId === aktuellerDurchlauf.current) setTage((v) => v.map((t) => (t.id === tagId ? { ...t, ...felder } : t)))
  }

  function haken(tag: TagebuchTag, vermittelt: boolean) {
    if (!durchlaufId) return
    const dl = durchlaufId
    const schluessel = `${dl}:${tag.id}`
    tagAktualisieren(dl, tag.id, { vermittelt, geaendert_von: ich.id })
    void einreihen(schluessel, async () => {
      try {
        const stand_am = await hakenSetzen(dl, tag, vermittelt)
        const s = serverStand.current.get(schluessel)
        serverStand.current.set(schluessel, { notiz: s?.notiz ?? '', stand_am })
        tagAktualisieren(dl, tag.id, { stand_am })
      } catch (e) {
        // Anzeige zurück auf den Stand der Datenbank
        const aktuell = await standLaden(dl, tag.id).catch(() => null)
        if (aktuell) {
          serverStand.current.set(schluessel, { notiz: aktuell.notiz, stand_am: aktuell.stand_am })
          tagAktualisieren(dl, tag.id, { vermittelt: aktuell.vermittelt, geaendert_von: aktuell.geaendert_von, stand_am: aktuell.stand_am })
        }
        throw new Error(`Der Haken wurde nicht gespeichert: ${(e as Error).message}`)
      }
    })
  }

  /** Speichert die Tagesnotiz, ohne die Änderung eines anderen Trainers zu überschreiben. */
  function notiz(dl: string, tag: TagebuchTag, text: string): Promise<void> {
    const schluessel = `${dl}:${tag.id}`
    const runde = konflikte.current.get(schluessel) ?? 0
    return einreihen(schluessel, async () => {
      if ((konflikte.current.get(schluessel) ?? 0) !== runde) return // nach einem Konflikt verworfen
      const basis = serverStand.current.get(schluessel) ?? { notiz: '', stand_am: null }
      if (basis.notiz === text) return
      const ergebnis = await notizSpeichern(dl, tag, basis, text)
      if (ergebnis.gespeichert) {
        serverStand.current.set(schluessel, { notiz: text, stand_am: ergebnis.stand_am })
        tagAktualisieren(dl, tag.id, { notiz: text, stand_am: ergebnis.stand_am })
        return
      }
      const a = ergebnis.aktuell
      konflikte.current.set(schluessel, runde + 1)
      serverStand.current.set(schluessel, { notiz: a.notiz, stand_am: a.stand_am })
      tagAktualisieren(dl, tag.id, { notiz: a.notiz, vermittelt: a.vermittelt, geaendert_von: a.geaendert_von, stand_am: a.stand_am })
      if (dl === aktuellerDurchlauf.current) setZurueckgesetzt((m) => new Map(m).set(tag.id, (m.get(tag.id) ?? 0) + 1))
      setFehler(
        `Die Notiz zu „${tag.tagebuch_titel ?? tagesBezeichnung(tag)}“ hat inzwischen jemand anderes geändert. ` +
          `Sie wurde neu geladen. Dein Text wurde nicht gespeichert: „${text}“`,
      )
    })
  }

  // ---- Gemeinsamer Durchlauf (Baustein 5): Team, Plan, Fassungen ----
  const ich = useIch()
  const [namen, setNamen] = useState<Map<string, string>>(new Map())
  const [kandidaten, setKandidaten] = useState<Trainer[]>([])
  const [mitwirkende, setMitwirkende] = useState<string[]>([])
  const [fassungen, setFassungen] = useState<Fassung[]>([])
  const durchlauf = durchlaeufe.find((d) => d.id === durchlaufId) ?? null
  const istBesitzer = Boolean(durchlauf && durchlauf.besitzer_id === ich.id)
  const team = durchlauf ? [durchlauf.besitzer_id, ...mitwirkende.filter((m) => m !== durchlauf.besitzer_id)] : []

  // Namen aller sichtbaren Trainer; aufnehmen kann man nur Trainer, die den Kurs selbst sehen dürfen
  useEffect(() => {
    if (!kursId) return
    let aktiv = true
    trainerLaden()
      .then(async (alle) => {
        if (!aktiv) return
        setNamen(new Map(alle.map((t) => [t.id, t.anzeigename])))
        const andere = alle.filter((t) => t.id !== ich.id && t.aktiv)
        const mitZugang = await Promise.all(
          andere.map(async (t) => ((await kursZugangVon(t.id, kursId).catch(() => false)) ? t : null)),
        )
        if (aktiv) setKandidaten(mitZugang.filter((t): t is Trainer => t !== null))
      })
      .catch((e: Error) => setFehler(`Trainer konnten nicht geladen werden: ${e.message}`))
    return () => {
      aktiv = false
    }
  }, [kursId, ich.id])

  const teamLaden = useCallback(async () => {
    if (!durchlaufId) {
      setMitwirkende([])
      return
    }
    setMitwirkende(await mitwirkendeLaden(durchlaufId))
  }, [durchlaufId])

  useEffect(() => {
    teamLaden().catch((e: Error) => setFehler(e.message))
  }, [teamLaden])

  // nur neu laden, wenn sich die Tage ändern, nicht bei jedem gespeicherten Haken
  const tageMitDeck = tage
    .filter((t) => t.deck_pfad)
    .map((t) => t.id)
    .join(',')
  useEffect(() => {
    fassungenFuerTage(tageMitDeck ? tageMitDeck.split(',') : [])
      .then(setFassungen)
      .catch((e: Error) => {
        setFassungen([])
        setFehler(`Fassungen konnten nicht geladen werden: ${e.message}`)
      })
  }, [tageMitDeck])

  async function planAendern(schritt: () => Promise<void>) {
    if (!kursId) return
    setFehler(null)
    try {
      await schritt()
      tageUebernehmen(durchlaufId, await tageLaden(kursId, durchlaufId))
      await teamLaden()
    } catch (e) {
      setFehler((e as Error).message)
    }
  }

  const erledigt = tage.filter((t) => t.vermittelt).length

  if (kurseGeladen && kurse.length === 0) {
    return (
      <div className="min-h-full bg-ifm-cream">
        <Kopfzeile titel="Trainertagebuch" />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <KeinKurs />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Trainertagebuch" />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {kurse.length > 1 && (
          <div className="mb-4 flex gap-2">
            {kurse.map((k) => (
              <button
                key={k.id}
                onClick={() => setKursId(k.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  k.id === kursId
                    ? 'bg-ifm-blue text-white'
                    : 'bg-white text-ifm-blue border border-ifm-lightblue'
                }`}
              >
                {k.name}
              </button>
            ))}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="text-sm text-ifm-gray">Durchlauf</label>
          <select
            value={durchlaufId ?? ''}
            onChange={(e) => setDurchlaufId(e.target.value || null)}
            className="rounded-lg border border-ifm-lightblue bg-white px-3 py-1.5 text-sm"
          >
            {durchlaeufe.length === 0 && <option value="">noch keiner angelegt</option>}
            {durchlaeufe.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.besitzer_id !== ich.id ? ` (von ${namen.get(d.besitzer_id) ?? 'einem anderen Trainer'})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => setNeuOffen((v) => !v)}
            className="text-sm text-ifm-gray hover:text-ifm-blue"
          >
            {neuOffen ? 'abbrechen' : 'neuer Durchlauf'}
          </button>
          {durchlaufId && (
            <span className="ml-auto text-sm text-ifm-gray">
              {erledigt} von {tage.length} Tagen vermittelt
            </span>
          )}
        </div>

        {neuOffen && kursId && (
          <NeuerDurchlauf
            kursId={kursId}
            fertig={(d) => {
              setDurchlaeufe((v) => [d, ...v])
              setDurchlaufId(d.id)
              setNeuOffen(false)
            }}
            fehlgeschlagen={setFehler}
          />
        )}

        {durchlauf && (
          <TeamLeiste
            durchlauf={durchlauf}
            istBesitzer={istBesitzer}
            mitwirkende={mitwirkende}
            kandidaten={kandidaten.filter((k) => !team.includes(k.id))}
            namen={namen}
            ichId={ich.id}
            aufnehmen={(t) => planAendern(() => mitwirkendenAufnehmen(durchlauf.id, t))}
            austragen={(t) => {
              const selbst = t === ich.id
              if (!window.confirm(selbst ? 'Dich aus diesem Durchlauf austragen?' : `${namen.get(t) ?? 'Trainer'} austragen?`)) return
              void planAendern(async () => {
                await mitwirkendenAustragen(durchlauf.id, t)
                if (selbst) {
                  setDurchlaeufe((v) => v.filter((d) => d.id !== durchlauf.id))
                  setDurchlaufId(null)
                }
              })
            }}
          />
        )}

        {fehler && (
          <p className="mb-4 rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>
        )}

        {!durchlaufId && durchlaeufe.length === 0 && (
          <p className="mb-4 rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Lege einen Durchlauf an. Die Haken hängen am Durchlauf, nicht am Kurs; beim nächsten
            Mal fängst du also wieder bei null an, ohne den alten Stand zu verlieren.
          </p>
        )}

        <div className="space-y-3">
          {tage.map((tag) => (
            <Tageszeile
              key={`${durchlaufId ?? '-'}:${tag.id}`}
              tag={tag}
              bearbeitbar={Boolean(durchlaufId)}
              haken={(v) => haken(tag, v)}
              notizSichern={(text) => (durchlaufId ? notiz(durchlaufId, tag, text) : Promise.resolve())}
              zurueckgesetzt={zurueckgesetzt.get(tag.id) ?? 0}
              plan={
                durchlauf && team.length > 1
                  ? {
                      team,
                      namen,
                      ichId: ich.id,
                      istBesitzer,
                      eigeneFassungen: fassungen.filter((f) => f.kurstag_id === tag.id && f.besitzer_id === ich.id),
                      gewaehlteFassung: fassungen.find((f) => f.id === tag.fassung_id) ?? null,
                      trainerSetzen: (t) => planAendern(() => planTrainerSetzen(durchlauf.id, tag.id, t)),
                      fassungSetzen: (f) => planAendern(() => planFassungSetzen(durchlauf.id, tag.id, f)),
                    }
                  : null
              }
            />
          ))}
        </div>

        {tage.length === 0 && !fehler && (
          <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Noch keine Tage vorhanden. Erst <code>npm run import:tagebuch</code> ausführen.
          </p>
        )}
      </main>
    </div>
  )
}

interface PlanAngaben {
  team: string[]
  namen: Map<string, string>
  ichId: string
  istBesitzer: boolean
  eigeneFassungen: Fassung[]
  gewaehlteFassung: Fassung | null
  trainerSetzen: (trainerId: string | null) => void
  fassungSetzen: (fassungId: string | null) => void
}

/**
 * Entwurf der Tagesnotiz: Tippen ändert nur das Feld; gespeichert wird nach einer kurzen Pause, beim
 * Verlassen des Feldes und beim Schließen der Zeile. Nach einem Konflikt (jemand anderes hat die Notiz
 * geändert) wird der Entwurf verworfen und der Stand der Datenbank gezeigt.
 */
function useNotizEntwurf(gespeichert: string, sichern: (text: string) => Promise<void>, zurueckgesetzt: number) {
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const ausstehend = useRef<string | null>(null)
  const uhr = useRef<number | undefined>(undefined)
  const sichernRef = useRef(sichern)
  useEffect(() => {
    sichernRef.current = sichern
  }, [sichern])

  const jetztSichern = useCallback(() => {
    window.clearTimeout(uhr.current)
    uhr.current = undefined
    const text = ausstehend.current
    if (text === null) return
    ausstehend.current = null
    void sichernRef.current(text).finally(() => {
      // Ohne neuere Eingabe zeigt das Feld wieder den gespeicherten Stand
      if (ausstehend.current === null) setEntwurf(null)
    })
  }, [])

  function tippen(text: string) {
    setEntwurf(text)
    ausstehend.current = text
    window.clearTimeout(uhr.current)
    uhr.current = window.setTimeout(jetztSichern, 800)
  }

  // Konflikt: Entwurf verwerfen (der nicht gespeicherte Text steht in der Fehlermeldung)
  useEffect(() => {
    if (zurueckgesetzt === 0) return
    window.clearTimeout(uhr.current)
    ausstehend.current = null
    setEntwurf(null)
  }, [zurueckgesetzt])

  // Beim Verlassen der Seite warnen, beim Schließen der Zeile noch speichern
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (ausstehend.current !== null) e.preventDefault()
    }
    window.addEventListener('beforeunload', warnen)
    return () => {
      window.removeEventListener('beforeunload', warnen)
      jetztSichern()
    }
  }, [jetztSichern])

  return { wert: entwurf ?? gespeichert, tippen, verlassen: jetztSichern }
}

function Tageszeile({
  tag,
  bearbeitbar,
  haken,
  notizSichern,
  zurueckgesetzt,
  plan,
}: {
  tag: TagebuchTag
  bearbeitbar: boolean
  haken: (vermittelt: boolean) => void
  notizSichern: (text: string) => Promise<void>
  /** steigt, wenn die Notiz wegen eines Konflikts neu geladen wurde */
  zurueckgesetzt: number
  /** nur bei gemeinsamen Durchläufen (mehr als ein Trainer) */
  plan: PlanAngaben | null
}) {
  const [offen, setOffen] = useState(false)
  const [kopiert, setKopiert] = useState(false)
  const notizFeld = useNotizEntwurf(tag.notiz, notizSichern, zurueckgesetzt)
  const text = kopiertext(tag)

  async function kopieren() {
    await navigator.clipboard.writeText(text)
    setKopiert(true)
    window.setTimeout(() => setKopiert(false), 2000)
  }

  return (
    <section
      className={`rounded-xl bg-white shadow-sm border ${
        tag.vermittelt ? 'border-ifm-green/40' : 'border-transparent'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <input
          type="checkbox"
          checked={tag.vermittelt}
          disabled={!bearbeitbar}
          onChange={(e) => haken(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[#1ba56e] disabled:opacity-40"
          title={bearbeitbar ? 'als vermittelt markieren' : 'erst einen Durchlauf wählen'}
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium text-ifm-gray">{tagesBezeichnung(tag)}</span>
            {tag.art !== 'kurstag' && (
              <span className="rounded bg-ifm-yellow/25 px-1.5 py-0.5 text-[11px] text-ifm-blue">
                ohne Deck
              </span>
            )}
          </div>
          <h2 className="font-medium text-ifm-blue">{tag.tagebuch_titel ?? 'Ohne Titel'}</h2>

          {plan && <PlanZeile tag={tag} plan={plan} />}
          {plan && tag.vermittelt && tag.geaendert_von && tag.geaendert_von !== plan.ichId && (
            <p className="mt-1 text-xs text-ifm-gray">abgehakt von {plan.namen.get(tag.geaendert_von) ?? 'einem Trainer'}</p>
          )}

          {offen && text && (
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-ifm-blue bg-ifm-cream rounded-lg p-3">
              {text}
            </pre>
          )}

          {offen && (
            <textarea
              value={notizFeld.wert}
              disabled={!bearbeitbar}
              placeholder={plan ? 'Notiz zu diesem Tag (sehen alle im Durchlauf), etwa was liegen blieb' : 'Notiz zu diesem Tag, etwa was liegen blieb'}
              onChange={(e) => notizFeld.tippen(e.target.value)}
              onBlur={notizFeld.verlassen}
              rows={2}
              className="mt-3 w-full rounded-lg border border-ifm-lightblue px-3 py-2 text-sm outline-none focus:border-ifm-blue disabled:opacity-50"
            />
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            onClick={kopieren}
            disabled={!text}
            className="rounded-lg bg-ifm-blue text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {kopiert ? 'kopiert' : 'Themen kopieren'}
          </button>
          <button
            onClick={() => setOffen((v) => !v)}
            className="text-xs text-ifm-gray hover:text-ifm-blue"
          >
            {offen ? 'zuklappen' : 'ansehen'}
          </button>
          {text && (
            <span className="text-[11px] text-ifm-gray">
              {text.length} Zeichen
              {tag.tagebuch_zeichen && tag.tagebuch_zeichen !== text.length
                ? ` (Vorlage ${tag.tagebuch_zeichen})`
                : ''}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

/** Wer hält den Tag, mit welcher Fassung (gemeinsamer Durchlauf, Baustein 5). */
function PlanZeile({ tag, plan }: { tag: TagebuchTag; plan: PlanAngaben }) {
  const name = (id: string) => (id === plan.ichId ? 'ich' : (plan.namen.get(id) ?? 'Trainer'))
  const meinTag = tag.trainer_id === plan.ichId
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ifm-gray">
      <span>hält:</span>
      {plan.istBesitzer ? (
        <select
          value={tag.trainer_id ?? ''}
          onChange={(e) => plan.trainerSetzen(e.target.value || null)}
          className="rounded border border-ifm-lightblue bg-white px-2 py-0.5 text-ifm-blue"
        >
          <option value="">noch offen</option>
          {plan.team.map((t) => (
            <option key={t} value={t}>
              {name(t)}
            </option>
          ))}
        </select>
      ) : (
        <span className="font-medium text-ifm-blue">{tag.trainer_id ? name(tag.trainer_id) : 'noch offen'}</span>
      )}
      {tag.deck_pfad && tag.trainer_id && (
        <>
          <span className="ml-2">mit:</span>
          {meinTag ? (
            <select
              value={tag.fassung_id ?? ''}
              onChange={(e) => plan.fassungSetzen(e.target.value || null)}
              className="rounded border border-ifm-lightblue bg-white px-2 py-0.5 text-ifm-blue"
              title="Eigene Fassungen legst du unter Kurstage, „⧉ Fassungen“ an"
            >
              <option value="">Original</option>
              {plan.eigeneFassungen.map((f) => (
                <option key={f.id} value={f.id}>
                  „{f.titel}“
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium text-ifm-blue">
              {tag.fassung_id ? `„${plan.gewaehlteFassung?.titel ?? 'eigene Fassung'}“` : 'Original'}
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** Wer im Durchlauf mitmacht; der Besitzer nimmt auf und trägt aus, Mitwirkende können sich austragen. */
function TeamLeiste({
  durchlauf,
  istBesitzer,
  mitwirkende,
  kandidaten,
  namen,
  ichId,
  aufnehmen,
  austragen,
}: {
  durchlauf: Durchlauf
  istBesitzer: boolean
  mitwirkende: string[]
  kandidaten: Trainer[]
  namen: Map<string, string>
  ichId: string
  aufnehmen: (trainerId: string) => void
  austragen: (trainerId: string) => void
}) {
  const [neu, setNeu] = useState('')
  const name = (id: string) => (id === ichId ? 'ich' : (namen.get(id) ?? 'Trainer'))
  if (!istBesitzer && mitwirkende.length === 0) return null
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
      <span className="text-ifm-gray">Team:</span>
      <span className="rounded bg-ifm-lightblue px-2 py-0.5 text-ifm-blue">{name(durchlauf.besitzer_id)} (leitet)</span>
      {mitwirkende.map((m) => (
        <span key={m} className="flex items-center gap-1 rounded bg-ifm-lightblue px-2 py-0.5 text-ifm-blue">
          {name(m)}
          {(istBesitzer || m === ichId) && (
            <button onClick={() => austragen(m)} title={m === ichId ? 'mich austragen' : 'austragen'} className="text-ifm-gray hover:text-ifm-red">
              ×
            </button>
          )}
        </span>
      ))}
      {istBesitzer &&
        (kandidaten.length > 0 ? (
          <>
            <select
              value={neu}
              onChange={(e) => setNeu(e.target.value)}
              className="ml-2 rounded border border-ifm-lightblue px-2 py-0.5 text-ifm-blue"
            >
              <option value="">Trainer aufnehmen …</option>
              {kandidaten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.anzeigename}
                </option>
              ))}
            </select>
            <button
              disabled={!neu}
              onClick={() => {
                aufnehmen(neu)
                setNeu('')
              }}
              className="rounded bg-ifm-blue px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Aufnehmen
            </button>
          </>
        ) : (
          mitwirkende.length === 0 && (
            <span className="text-xs text-ifm-gray">
              Aufnehmen kannst du Trainer, denen der Kurs freigegeben ist (Seite „Freigaben“).
            </span>
          )
        ))}
    </div>
  )
}

function NeuerDurchlauf({
  kursId,
  fertig,
  fehlgeschlagen,
}: {
  kursId: string
  fertig: (d: Durchlauf) => void
  fehlgeschlagen: (meldung: string) => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [ende, setEnde] = useState('')
  const [busy, setBusy] = useState(false)

  async function anlegen() {
    setBusy(true)
    try {
      fertig(await durchlaufAnlegen(kursId, name.trim() || 'Ohne Namen', start, ende))
    } catch (e) {
      fehlgeschlagen((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 rounded-xl bg-white p-4 shadow-sm flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-ifm-gray">Bezeichnung</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="WEG August 2026"
          className="mt-1 rounded-lg border border-ifm-lightblue px-3 py-1.5 outline-none focus:border-ifm-blue"
        />
      </label>
      <label className="text-sm">
        <span className="block text-ifm-gray">Beginn</span>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="mt-1 rounded-lg border border-ifm-lightblue px-3 py-1.5 outline-none focus:border-ifm-blue"
        />
      </label>
      <label className="text-sm">
        <span className="block text-ifm-gray">Ende</span>
        <input
          type="date"
          value={ende}
          onChange={(e) => setEnde(e.target.value)}
          className="mt-1 rounded-lg border border-ifm-lightblue px-3 py-1.5 outline-none focus:border-ifm-blue"
        />
      </label>
      <button
        onClick={anlegen}
        disabled={busy}
        className="rounded-lg bg-ifm-blue text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        anlegen
      </button>
    </div>
  )
}
