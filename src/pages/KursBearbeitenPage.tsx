import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Kopfzeile from '../components/Kopfzeile'
import {
  KURSNAME_MAX,
  TAGESARTEN,
  TITEL_MAX,
  eigeneTageLaden,
  eigenenKursLaden,
  kursLoeschen,
  kursUmbenennen,
  tagAendern,
  tagAnlegen,
  tagDateienSetzen,
  tagLoeschen,
  type EigenerKurs,
  type EigenerTag,
  type Tagesart,
} from '../lib/eigeneKurse'
import { useIch } from '../lib/TrainerContext'

/**
 * Einen eigenen, im Tool angelegten Kurs bearbeiten (SPEC.md, Baustein 10): Name, Kurstage, Dateien je
 * Tag, Löschen. Kurse aus dem Deck-Sync erscheinen hier nicht; die pflegt ihr Besitzer in den Kursordnern.
 */
export default function KursBearbeitenPage() {
  const { kursId } = useParams()
  return <KursBearbeiten key={kursId} kursId={kursId ?? ''} />
}

function KursBearbeiten({ kursId }: { kursId: string }) {
  const ich = useIch()
  const navigate = useNavigate()
  const [kurs, setKurs] = useState<EigenerKurs | null>(null)
  const [tage, setTage] = useState<EigenerTag[]>([])
  const [name, setName] = useState('')
  const [laedt, setLaedt] = useState(true)
  const [gesperrt, setGesperrt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)

  async function laden() {
    const k = await eigenenKursLaden(kursId)
    setKurs(k)
    if (k) {
      setName((vorher) => vorher || k.name)
      setTage(await eigeneTageLaden(k.id))
    }
  }

  useEffect(() => {
    laden()
      .catch((e: Error) => setFehler(e.message))
      .finally(() => setLaedt(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kursId])

  async function ausfuehren(schritt: () => Promise<void>, meldung?: string): Promise<boolean> {
    setGesperrt(true)
    setFehler(null)
    setErfolg(null)
    try {
      await schritt()
      await laden()
      if (meldung) setErfolg(meldung)
      return true
    } catch (e) {
      setFehler((e as Error).message)
      await laden().catch(() => undefined)
      return false
    } finally {
      setGesperrt(false)
    }
  }

  const darf = kurs && kurs.besitzer_id === ich.id && kurs.angelegt_im_tool

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Kurs bearbeiten" />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6 text-sm text-ifm-blue">
        <p className="flex gap-4">
          <Link to="/eigene-kurse" className="underline-offset-2 hover:underline">
            ← Eigene Kurse
          </Link>
          {darf && (
            <Link to="/kurstage" className="underline-offset-2 hover:underline">
              Zu den Kurstagen
            </Link>
          )}
        </p>

        {fehler && <p className="rounded-lg bg-ifm-red/15 p-3">{fehler}</p>}
        {erfolg && <p className="rounded-lg bg-ifm-green/15 p-3">{erfolg}</p>}
        {laedt && <p className="text-ifm-gray">Lädt …</p>}

        {!laedt && !darf && (
          <p className="rounded-lg bg-ifm-lightblue p-4">
            Diesen Kurs kannst du hier nicht bearbeiten. Hier erscheinen nur Kurse, die du selbst im Tool angelegt hast.
          </p>
        )}

        {darf && kurs && (
          <>
            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-bold">Kurs</h2>
              <label className="block">
                <span className="text-xs font-medium text-ifm-gray">Kursname</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={KURSNAME_MAX}
                  className="mt-1 w-full rounded-lg border border-ifm-lightblue p-2"
                />
              </label>
              <button
                onClick={() => void ausfuehren(() => kursUmbenennen(kurs.id, name), 'Name gespeichert.')}
                disabled={gesperrt || !name.trim() || name.trim() === kurs.name}
                className="mt-3 rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
              >
                Namen speichern
              </button>
              <p className="mt-3 text-ifm-gray">
                Den Kurs siehst nur du, bis du ihn unter „Freigaben“ anderen Trainern freigibst.
              </p>
            </section>

            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-bold">Kurstage</h2>
              {tage.length === 0 ? (
                <p className="text-ifm-gray">Noch keine Kurstage. Unten bei „Kurstag anlegen“ geht es los.</p>
              ) : (
                <ul className="space-y-3">
                  {tage.map((t) => (
                    <TagZeile
                      key={t.id}
                      tag={t}
                      gesperrt={gesperrt}
                      hochladen={(dateien) =>
                        ausfuehren(() => tagDateienSetzen(kurs, t, dateien), `${bezeichnung(t)}: Dateien hochgeladen.`)
                      }
                      aendern={(angaben) => ausfuehren(() => tagAendern(t, angaben), `${bezeichnung(t)}: gespeichert.`)}
                      loeschen={() => {
                        if (!window.confirm(`${bezeichnung(t)} mit seinen Dateien endgültig löschen?`)) return
                        void ausfuehren(() => tagLoeschen(t), `${bezeichnung(t)} gelöscht.`)
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>

            <NeuerTag
              gesperrt={gesperrt}
              tage={tage}
              anlegen={(angaben) => ausfuehren(() => tagAnlegen(kurs.id, angaben), 'Tag angelegt.')}
            />

            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-base font-bold">Kurs löschen</h2>
              <p className="text-ifm-gray">
                Löscht den Kurs mit allen Kurstagen, Dateien, Freigaben und Tagebüchern, auch die gemeinsamen
                Durchläufe anderer Trainer. Deine Ordner auf dem Rechner bleiben.
              </p>
              <button
                onClick={() => {
                  if (!window.confirm(`„${kurs.name}“ mit allen Kurstagen, Dateien, Freigaben und Tagebüchern endgültig löschen?`)) return
                  void ausfuehren(() => kursLoeschen(kurs)).then((ok) => {
                    if (ok) navigate('/eigene-kurse')
                  })
                }}
                disabled={gesperrt}
                className="mt-3 rounded-lg border border-ifm-red px-3 py-1.5 font-medium text-ifm-red disabled:opacity-50"
              >
                Kurs löschen
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function bezeichnung(t: { art: Tagesart; nummer: number }): string {
  if (t.art === 'pruefung') return `Abschlussprüfung ${t.nummer}`
  if (t.art === 'projekttag') return `Projekttag ${t.nummer}`
  return `Tag ${t.nummer}`
}

function naechsteNummer(tage: EigenerTag[], art: Tagesart): number {
  return Math.max(0, ...tage.filter((t) => t.art === art).map((t) => t.nummer)) + 1
}

function datum(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
}

function TagZeile({
  tag,
  gesperrt,
  hochladen,
  aendern,
  loeschen,
}: {
  tag: EigenerTag
  gesperrt: boolean
  hochladen: (dateien: { deck: File; quellen: File; pdf: File | null }) => Promise<boolean>
  aendern: (angaben: { titel: string; segment: number | null; segment_titel: string | null }) => Promise<boolean>
  loeschen: () => void
}) {
  const [offen, setOffen] = useState<'hochladen' | 'aendern' | null>(null)
  const [deck, setDeck] = useState<File | null>(null)
  const [quellen, setQuellen] = useState<File | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [titel, setTitel] = useState(tag.titel ?? '')
  const [segment, setSegment] = useState(tag.segment?.toString() ?? '')
  const [segmentTitel, setSegmentTitel] = useState(tag.segment_titel ?? '')

  return (
    <li className="rounded-lg border border-ifm-lightblue p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">
          {bezeichnung(tag)} · {tag.titel ?? 'Ohne Titel'}
        </span>
        {tag.segment !== null && (
          <span className="text-xs text-ifm-gray">
            Abschnitt {tag.segment}
            {tag.segment_titel ? ` · ${tag.segment_titel}` : ''}
          </span>
        )}
        <span className="text-xs text-ifm-gray">
          {tag.deck_pfad ? `Dateien vom ${datum(tag.deck_aktualisiert_am)}${tag.pdf_pfad ? ', mit PDF' : ', ohne PDF'}` : 'noch keine Dateien'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        <button onClick={() => setOffen(offen === 'hochladen' ? null : 'hochladen')} className="font-medium underline-offset-2 hover:underline">
          Dateien hochladen
        </button>
        <button onClick={() => setOffen(offen === 'aendern' ? null : 'aendern')} className="font-medium underline-offset-2 hover:underline">
          Ändern
        </button>
        <button onClick={loeschen} disabled={gesperrt} className="text-ifm-gray hover:text-ifm-red disabled:opacity-50">
          Löschen
        </button>
      </div>

      {offen === 'hochladen' && (
        <div className="mt-3 space-y-2 rounded-lg bg-ifm-cream p-3 text-xs">
          <label className="block">
            <span className="font-medium text-ifm-gray">Gebautes Deck (HTML aus dist/)</span>
            <input type="file" accept=".html,.htm" onChange={(e) => setDeck(e.target.files?.[0] ?? null)} className="mt-1 block" />
          </label>
          <label className="block">
            <span className="font-medium text-ifm-gray">Ordner des Tages als Zip</span>
            <input type="file" accept=".zip" onChange={(e) => setQuellen(e.target.files?.[0] ?? null)} className="mt-1 block" />
          </label>
          <label className="block">
            <span className="font-medium text-ifm-gray">PDF für die Teilnehmer (optional; ohne neues PDF fällt ein altes weg)</span>
            <input type="file" accept=".pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className="mt-1 block" />
          </label>
          <button
            disabled={gesperrt || !deck || !quellen}
            onClick={() => {
              if (!deck || !quellen) return
              void hochladen({ deck, quellen, pdf }).then((ok) => {
                if (ok) setOffen(null)
              })
            }}
            className="rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            {gesperrt ? 'Lädt hoch …' : 'Hochladen'}
          </button>
        </div>
      )}

      {offen === 'aendern' && (
        <div className="mt-3 space-y-2 rounded-lg bg-ifm-cream p-3 text-xs">
          <label className="block">
            <span className="font-medium text-ifm-gray">Titel</span>
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              maxLength={TITEL_MAX}
              className="mt-1 w-full rounded-lg border border-ifm-lightblue bg-white p-2"
            />
          </label>
          <Abschnitt segment={segment} setSegment={setSegment} segmentTitel={segmentTitel} setSegmentTitel={setSegmentTitel} />
          <button
            disabled={gesperrt || !titel.trim()}
            onClick={() =>
              void aendern({
                titel,
                segment: segment.trim() ? Number(segment) : null,
                segment_titel: segmentTitel,
              }).then((ok) => {
                if (ok) setOffen(null)
              })
            }
            className="rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      )}
    </li>
  )
}

function Abschnitt({
  segment,
  setSegment,
  segmentTitel,
  setSegmentTitel,
}: {
  segment: string
  setSegment: (s: string) => void
  segmentTitel: string
  setSegmentTitel: (s: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="block">
        <span className="font-medium text-ifm-gray">Abschnitt (optional, Nummer)</span>
        <input
          type="number"
          min={1}
          max={99}
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="mt-1 block w-24 rounded-lg border border-ifm-lightblue bg-white p-2"
        />
      </label>
      <label className="block min-w-0 flex-1">
        <span className="font-medium text-ifm-gray">Name des Abschnitts (optional)</span>
        <input
          value={segmentTitel}
          onChange={(e) => setSegmentTitel(e.target.value)}
          maxLength={TITEL_MAX}
          disabled={!segment.trim()}
          className="mt-1 w-full rounded-lg border border-ifm-lightblue bg-white p-2 disabled:opacity-50"
        />
      </label>
    </div>
  )
}

function NeuerTag({
  gesperrt,
  tage,
  anlegen,
}: {
  gesperrt: boolean
  tage: EigenerTag[]
  anlegen: (angaben: { art: Tagesart; nummer: number; titel: string; segment: number | null; segment_titel: string | null }) => Promise<boolean>
}) {
  const [art, setArt] = useState<Tagesart>('kurstag')
  const vorschlag = naechsteNummer(tage, art)
  const [nummer, setNummer] = useState('')
  const [titel, setTitel] = useState('')
  const [segment, setSegment] = useState('')
  const [segmentTitel, setSegmentTitel] = useState('')
  const nr = nummer.trim() ? Number(nummer) : vorschlag

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm space-y-3">
      <h2 className="text-base font-bold">Kurstag anlegen</h2>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="block">
          <span className="font-medium text-ifm-gray">Art</span>
          <select
            value={art}
            onChange={(e) => setArt(e.target.value as Tagesart)}
            className="mt-1 block rounded-lg border border-ifm-lightblue p-2"
          >
            {TAGESARTEN.map((a) => (
              <option key={a.wert} value={a.wert}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-medium text-ifm-gray">Nummer</span>
          <input
            type="number"
            min={1}
            max={999}
            value={nummer}
            placeholder={String(vorschlag)}
            onChange={(e) => setNummer(e.target.value)}
            className="mt-1 block w-24 rounded-lg border border-ifm-lightblue p-2"
          />
        </label>
        <label className="block min-w-0 flex-1">
          <span className="font-medium text-ifm-gray">Titel (z. B. „Grundlagen und Begriffe“)</span>
          <input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            maxLength={TITEL_MAX}
            className="mt-1 w-full rounded-lg border border-ifm-lightblue p-2"
          />
        </label>
      </div>
      <div className="text-xs">
        <Abschnitt segment={segment} setSegment={setSegment} segmentTitel={segmentTitel} setSegmentTitel={setSegmentTitel} />
      </div>
      <button
        disabled={gesperrt || !titel.trim()}
        onClick={() =>
          void anlegen({
            art,
            nummer: nr,
            titel,
            segment: segment.trim() ? Number(segment) : null,
            segment_titel: segmentTitel,
          }).then((ok) => {
            if (ok) {
              setNummer('')
              setTitel('')
            }
          })
        }
        className="rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
      >
        Tag anlegen
      </button>
      <p className="text-xs text-ifm-gray">
        Art und Nummer bleiben danach fest; Titel und Abschnitt lassen sich über „Ändern“ anpassen.
      </p>
    </section>
  )
}
