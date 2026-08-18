import { useEffect, useState } from 'react'
import { kurseLaden, type Kurs } from '../lib/kurse'
import {
  durchlaeufeLaden,
  durchlaufAnlegen,
  kopiertext,
  standSetzen,
  tageLaden,
  tagesBezeichnung,
  type Durchlauf,
  type TagebuchTag,
} from '../lib/tagebuch'
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

  useEffect(() => {
    kurseLaden()
      .then((k) => {
        setKurse(k)
        setKursId((v) => v ?? k[0]?.id ?? null)
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

  useEffect(() => {
    if (!kursId) return
    tageLaden(kursId, durchlaufId)
      .then(setTage)
      .catch((e: Error) => setFehler(e.message))
  }, [kursId, durchlaufId])

  async function aendern(tag: TagebuchTag, aenderung: { vermittelt?: boolean; notiz?: string }) {
    if (!durchlaufId) return
    setTage((vorher) => vorher.map((t) => (t.id === tag.id ? { ...t, ...aenderung } : t)))
    try {
      await standSetzen(durchlaufId, tag, aenderung)
    } catch (e) {
      setFehler((e as Error).message)
    }
  }

  const erledigt = tage.filter((t) => t.vermittelt).length

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
              key={tag.id}
              tag={tag}
              bearbeitbar={Boolean(durchlaufId)}
              aendern={aendern}
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

function Tageszeile({
  tag,
  bearbeitbar,
  aendern,
}: {
  tag: TagebuchTag
  bearbeitbar: boolean
  aendern: (tag: TagebuchTag, aenderung: { vermittelt?: boolean; notiz?: string }) => void
}) {
  const [offen, setOffen] = useState(false)
  const [kopiert, setKopiert] = useState(false)
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
          onChange={(e) => aendern(tag, { vermittelt: e.target.checked })}
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

          {offen && text && (
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-ifm-blue bg-ifm-cream rounded-lg p-3">
              {text}
            </pre>
          )}

          {offen && (
            <textarea
              value={tag.notiz}
              disabled={!bearbeitbar}
              placeholder="Notiz zu diesem Tag, etwa was liegen blieb"
              onChange={(e) => aendern(tag, { notiz: e.target.value })}
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
