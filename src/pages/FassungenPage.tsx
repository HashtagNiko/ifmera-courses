import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Kopfzeile from '../components/Kopfzeile'
import { deckOeffnen } from '../lib/deckOeffnen'
import {
  aufStandSetzen,
  dateienSetzen,
  deckPruefen,
  fassungAnlegen,
  fassungFreigeben,
  fassungLoeschen,
  fassungenLaden,
  fassungsFreigabeEntfernen,
  fassungsFreigabenLaden,
  kursZugangVon,
  zipPruefen,
  type Fassung,
  type FassungFreigabe,
  type FassungStufe,
} from '../lib/fassungen'
import { dateiHerunterladen, kurstagLaden, type KurstagMitKurs } from '../lib/kurse'
import { darfFassung, darfNotizen, meineStufenLaden, trainerLaden, type Trainer } from '../lib/trainer'
import { useIch } from '../lib/TrainerContext'

/**
 * Eigene Fassungen eines Kurstags (SPEC.md, Baustein 4), in beide Richtungen: Quellpaket laden,
 * mit Claude bearbeiten und bauen, hier hochladen, anderen Trainern freigeben. Was jemand sieht und
 * darf, entscheidet die Datenbank; das Original bleibt immer unverändert.
 */
export default function FassungenPage() {
  const { tagId } = useParams()
  return <FassungenSeite key={tagId} tagId={tagId} />
}

const STUFEN_FASSUNG: { wert: FassungStufe; name: string }[] = [
  { wert: 'nutzen', name: 'Ansehen & herunterladen' },
  { wert: 'fassung', name: '+ eigene Kopie bearbeiten' },
]

const dateiname = (text: string) => text.replace(/[\\/:*?"<>|]/g, '-').trim()

function FassungenSeite({ tagId }: { tagId: string | undefined }) {
  const ich = useIch()
  const [tag, setTag] = useState<KurstagMitKurs | null>(null)
  const [fassungen, setFassungen] = useState<Fassung[]>([])
  const [freigaben, setFreigaben] = useState<FassungFreigabe[]>([])
  const [namen, setNamen] = useState<Map<string, string>>(new Map())
  const [empfaenger, setEmpfaenger] = useState<Trainer[]>([])
  const [darf, setDarf] = useState(false)
  const [notizen, setNotizen] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [arbeitet, setArbeitet] = useState(false)

  const neuLaden = useCallback(async () => {
    if (!tagId) return
    const t = await kurstagLaden(tagId)
    if (!t) throw new Error('Diesen Kurstag gibt es nicht, oder er ist nicht für dich freigegeben.')
    const [f, stufen, trainer] = await Promise.all([fassungenLaden(t.id), meineStufenLaden(ich.id), trainerLaden()])
    const fr = await fassungsFreigabenLaden(f.map((x) => x.id))
    // Freigeben kann man nur an Trainer, die den Kurs selbst sehen dürfen
    const andere = trainer.filter((x) => x.id !== ich.id && x.aktiv)
    const mitZugang = await Promise.all(
      andere.map(async (x) => ((await kursZugangVon(x.id, t.kurs_id).catch(() => false)) ? x : null)),
    )
    setTag(t)
    setFassungen(f)
    setFreigaben(fr)
    setNamen(new Map(trainer.map((x) => [x.id, x.anzeigename])))
    setEmpfaenger(mitZugang.filter((x): x is Trainer => x !== null))
    const besitzer = t.kurse?.besitzer_id ?? ''
    setDarf(darfFassung(besitzer, ich.id, stufen.get(t.kurs_id)))
    setNotizen(darfNotizen(besitzer, ich.id, stufen.get(t.kurs_id)))
  }, [tagId, ich.id])

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

  const eigene = fassungen.filter((f) => f.besitzer_id === ich.id)
  const fremde = fassungen.filter((f) => f.besitzer_id !== ich.id)
  const meineStufe = (f: Fassung) =>
    f.besitzer_id === ich.id
      ? 'besitzer'
      : freigaben.find((fr) => fr.fassung_id === f.id && fr.trainer_id === ich.id)?.stufe
  const kopierbar = fassungen.filter((f) => ['besitzer', 'fassung'].includes(meineStufe(f) ?? '') && f.quellen_pfad)

  /** Aktueller Stand der Grundlage einer Fassung (Original oder andere Fassung) */
  const grundlageStand = (f: Fassung): string | null =>
    f.grundlage_art === 'fassung'
      ? (fassungen.find((x) => x.id === f.grundlage_fassung_id)?.quellen_hash ?? null)
      : (tag?.quellen_hash ?? null)
  const grundlageName = (f: Fassung): string => {
    if (f.grundlage_art === 'original') return 'Original'
    if (!f.grundlage_fassung_id) return 'eine inzwischen gelöschte Fassung'
    const g = fassungen.find((x) => x.id === f.grundlage_fassung_id)
    return g ? `„${g.titel}“ von ${namen.get(g.besitzer_id) ?? 'einem Trainer'}` : 'einer anderen Fassung'
  }
  const basis = tag ? (tag.liefername ?? `Tag ${tag.nummer}`) : ''

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Eigene Fassungen" />

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        <Link to="/kurstage" className="text-sm text-ifm-gray hover:text-ifm-blue">
          ← zurück zu den Kurstagen
        </Link>

        {tag && (
          <h2 className="text-lg font-bold text-ifm-blue">
            {tag.kurse?.name} · Tag {tag.nummer}
            {(tag.titel ?? tag.tagebuch_titel) && ` · ${tag.titel ?? tag.tagebuch_titel}`}
          </h2>
        )}

        <section className="rounded-xl bg-white p-5 shadow-sm text-sm text-ifm-blue space-y-2">
          <p className="font-medium">So entsteht eine eigene Fassung:</p>
          <ol className="list-decimal pl-5 space-y-1 text-ifm-gray">
            <li>Quellpaket laden – vom Original oder von einer Fassung, die dir jemand freigegeben hat.</li>
            <li>
              Entpacken und mit Claude Code bearbeiten. Die Anleitung liegt als <code>CLAUDE.md</code> im
              Paket; gebaut wird mit <code>python engine/build.py .</code>
            </li>
            <li>Hier hochladen: das gebaute Deck aus <code>dist/</code> und den ganzen Ordner als Zip.</li>
          </ol>
          <p className="text-ifm-gray">
            Deine Fassung siehst nur du, bis du sie freigibst. Das Original bleibt immer unverändert.
          </p>
        </section>

        {laedt && <p className="text-sm text-ifm-gray">Lädt …</p>}
        {fehler && <p className="rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>}

        {!laedt && tag && !darf && (
          <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Eigene Fassungen brauchen für diesen Kurs die Stufe „+ eigene Kopie bearbeiten“; die vergibt der
            Besitzer des Kurses unter „Freigaben“.
            {fremde.length > 0 && ' Fassungen, die dir andere freigegeben haben, siehst du unten.'}
          </p>
        )}

        {!laedt && tag && darf && (
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-bold text-ifm-blue">Original</h3>
            {tag.quellen_pfad ? (
              <button
                disabled={arbeitet}
                onClick={() =>
                  ausfuehren(() => dateiHerunterladen(tag.quellen_pfad!, `${dateiname(basis)} (Quellen).zip`))
                }
                className="mt-2 rounded-lg bg-ifm-blue px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Quellpaket des Originals laden
              </button>
            ) : (
              <p className="mt-2 text-sm text-ifm-gray">Zu diesem Tag gibt es noch kein Quellpaket.</p>
            )}
          </section>
        )}

        {eigene.length > 0 && (
          <section className="space-y-3">
            <h3 className="font-bold text-ifm-blue">Meine Fassungen</h3>
            {eigene.map((f) => (
              <FassungKarte
                key={f.id}
                fassung={f}
                eigen
                stufe="besitzer"
                besitzerName={ich.anzeigename}
                grundlage={grundlageName(f)}
                veraltet={Boolean(grundlageStand(f) && grundlageStand(f) !== f.grundlage_hash)}
                freigaben={freigaben.filter((fr) => fr.fassung_id === f.id)}
                empfaenger={empfaenger}
                namen={namen}
                gesperrt={arbeitet}
                basis={basis}
                notizenKurstag={notizen ? tag?.id : undefined}
                ichName={ich.anzeigename}
                ausfuehren={ausfuehren}
                ichId={ich.id}
                aufStand={() => ausfuehren(() => aufStandSetzen(f.id, grundlageStand(f)!))}
              />
            ))}
          </section>
        )}

        {fremde.length > 0 && (
          <section className="space-y-3">
            <h3 className="font-bold text-ifm-blue">Für dich freigegeben</h3>
            {fremde.map((f) => (
              <FassungKarte
                key={f.id}
                fassung={f}
                eigen={false}
                stufe={meineStufe(f) ?? 'nutzen'}
                besitzerName={namen.get(f.besitzer_id) ?? 'ein anderer Trainer'}
                grundlage={grundlageName(f)}
                veraltet={false}
                freigaben={[]}
                empfaenger={[]}
                namen={namen}
                gesperrt={arbeitet}
                basis={basis}
                notizenKurstag={notizen ? tag?.id : undefined}
                ichName={ich.anzeigename}
                ausfuehren={ausfuehren}
                ichId={ich.id}
                aufStand={() => Promise.resolve()}
              />
            ))}
          </section>
        )}

        {!laedt && tag && darf && (
          <NeueFassung
            kopierbar={kopierbar}
            namen={namen}
            ichId={ich.id}
            gesperrt={arbeitet}
            anlegen={(angaben) =>
              ausfuehren(async () => {
                const grundlage = kopierbar.find((x) => x.id === angaben.grundlageId)
                await fassungAnlegen(ich.id, {
                  kurstagId: tag.id,
                  titel: angaben.titel,
                  bemerkung: angaben.bemerkung,
                  grundlageFassungId: grundlage?.id ?? null,
                  grundlageHash: grundlage ? grundlage.quellen_hash : tag.quellen_hash,
                  deck: angaben.deck,
                  quellen: angaben.quellen,
                })
              })
            }
          />
        )}
      </main>
    </div>
  )
}

function FassungKarte({
  fassung: f,
  eigen,
  stufe,
  besitzerName,
  grundlage,
  veraltet,
  freigaben,
  empfaenger,
  namen,
  gesperrt,
  basis,
  notizenKurstag,
  ichName,
  ichId,
  ausfuehren,
  aufStand,
}: {
  fassung: Fassung
  eigen: boolean
  stufe: string
  besitzerName: string
  grundlage: string
  veraltet: boolean
  freigaben: FassungFreigabe[]
  empfaenger: Trainer[]
  namen: Map<string, string>
  gesperrt: boolean
  basis: string
  notizenKurstag: string | undefined
  ichName: string
  ichId: string
  ausfuehren: (schritt: () => Promise<void>) => Promise<void>
  aufStand: () => Promise<void>
}) {
  const [neuTrainer, setNeuTrainer] = useState('')
  const [neuStufe, setNeuStufe] = useState<FassungStufe>('nutzen')
  const [versionOffen, setVersionOffen] = useState(false)
  const name = `${dateiname(basis)} - ${dateiname(f.titel)}`
  const markierung = () => `${ichName}, heruntergeladen am ${new Date().toLocaleString('de-DE')} über courses.shnoozy.top`
  const offen = empfaenger.filter((t) => !freigaben.some((fr) => fr.trainer_id === t.id))

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm text-sm space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium text-ifm-blue">{f.titel}</span>
        <span className="text-xs text-ifm-gray">
          {eigen ? 'von dir' : `von ${besitzerName}`} · Grundlage: {grundlage} · Stand{' '}
          {new Date(f.geaendert_am).toLocaleDateString('de-DE')}
        </span>
      </div>
      {f.bemerkung && <p className="text-ifm-gray whitespace-pre-wrap">{f.bemerkung}</p>}

      {veraltet && (
        <div className="rounded-lg bg-ifm-yellow/25 p-3 text-ifm-blue">
          Die Grundlage ({grundlage}) wurde geändert, seit diese Fassung entstand. Lade ihr neues
          Quellpaket und lass Claude die Änderungen in deine Fassung übernehmen (beide Ordner
          nebeneinander entpacken). Danach eine neue Version hochladen.
          <button
            disabled={gesperrt}
            onClick={() => void aufStand()}
            className="ml-2 underline underline-offset-2 disabled:opacity-50"
          >
            Ist erledigt, Fassung ist auf dem neuen Stand
          </button>
        </div>
      )}

      {!eigen && (
        <p className="text-xs text-ifm-gray">
          Fremde Fassungen öffnest du nach dem Herunterladen auf deinem Rechner. Im Tool liefe ein fremdes
          Deck mit deiner Anmeldung; heruntergeladen läuft es getrennt davon.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {/* Öffnen im Tool nur für eigene Fassungen: das Deck läuft dort mit der Anmeldung des Betrachters */}
        {eigen && f.deck_pfad && (
          <button
            onClick={() => deckOeffnen(f.deck_pfad!, f.titel, undefined, notizenKurstag, 'fassungen')}
            className="rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white"
          >
            Öffnen
          </button>
        )}
        {f.deck_pfad && (
          <button
            disabled={gesperrt}
            onClick={() =>
              ausfuehren(() =>
                dateiHerunterladen(f.deck_pfad!, `${name}.html`, { markierung: markierung() }, notizenKurstag, 'fassungen'),
              )
            }
            className="font-medium text-ifm-blue underline-offset-2 hover:underline disabled:opacity-50"
          >
            Deck herunterladen
          </button>
        )}
        {f.quellen_pfad && (stufe === 'besitzer' || stufe === 'fassung') && (
          <button
            disabled={gesperrt}
            onClick={() =>
              ausfuehren(() => dateiHerunterladen(f.quellen_pfad!, `${name} (Quellen).zip`, undefined, undefined, 'fassungen'))
            }
            className="font-medium text-ifm-blue underline-offset-2 hover:underline disabled:opacity-50"
          >
            Quellpaket laden
          </button>
        )}
        {eigen && (
          <>
            <button
              onClick={() => setVersionOffen((v) => !v)}
              className="font-medium text-ifm-blue underline-offset-2 hover:underline"
            >
              Neue Version hochladen
            </button>
            <button
              disabled={gesperrt}
              onClick={() => {
                if (!window.confirm(`Fassung „${f.titel}“ samt Dateien löschen? Das lässt sich nicht rückgängig machen.`)) return
                void ausfuehren(() => fassungLoeschen(ichId, f.id))
              }}
              className="ml-auto text-ifm-gray hover:text-ifm-red disabled:opacity-50"
            >
              Löschen
            </button>
          </>
        )}
      </div>

      {eigen && versionOffen && (
        <DateienWahl
          knopf="Neue Version hochladen"
          gesperrt={gesperrt}
          weiter={(deck, quellen) =>
            ausfuehren(async () => {
              await dateienSetzen(ichId, f.id, deck, quellen)
              setVersionOffen(false)
            })
          }
        />
      )}

      {eigen && (
        <div className="border-t border-ifm-lightblue pt-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ifm-gray">Freigegeben für</p>
          {freigaben.length === 0 && <p className="text-xs text-ifm-gray">Nur für dich sichtbar.</p>}
          {freigaben.map((fr) => (
            <div key={fr.trainer_id} className="flex flex-wrap items-center gap-3 text-xs">
              <span className="min-w-32 font-medium text-ifm-blue">{namen.get(fr.trainer_id) ?? 'Trainer'}</span>
              <StufenWahl
                wert={fr.stufe}
                gesperrt={gesperrt}
                onChange={(s) => void ausfuehren(() => fassungFreigeben(f.id, fr.trainer_id, s))}
              />
              <button
                disabled={gesperrt}
                onClick={() => void ausfuehren(() => fassungsFreigabeEntfernen(f.id, fr.trainer_id))}
                className="text-ifm-gray hover:text-ifm-red disabled:opacity-50"
              >
                Entfernen
              </button>
            </div>
          ))}
          {offen.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <select
                value={neuTrainer}
                onChange={(e) => setNeuTrainer(e.target.value)}
                disabled={gesperrt}
                className="rounded-lg border border-ifm-lightblue px-2 py-1 text-ifm-blue"
              >
                <option value="">Trainer wählen …</option>
                {offen.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.anzeigename}
                  </option>
                ))}
              </select>
              <StufenWahl wert={neuStufe} gesperrt={gesperrt} onChange={setNeuStufe} />
              <button
                disabled={gesperrt || !neuTrainer}
                onClick={() => {
                  const t = neuTrainer
                  setNeuTrainer('')
                  void ausfuehren(() => fassungFreigeben(f.id, t, neuStufe))
                }}
                className="rounded-lg bg-ifm-blue px-3 py-1 font-medium text-white disabled:opacity-50"
              >
                Freigeben
              </button>
            </div>
          ) : (
            freigaben.length === 0 && (
              <p className="text-xs text-ifm-gray">Freigeben kannst du an Trainer, die diesen Kurs selbst sehen dürfen.</p>
            )
          )}
        </div>
      )}
    </div>
  )
}

function StufenWahl({
  wert,
  gesperrt,
  onChange,
}: {
  wert: FassungStufe
  gesperrt: boolean
  onChange: (s: FassungStufe) => void
}) {
  return (
    <select
      value={wert}
      onChange={(e) => onChange(e.target.value as FassungStufe)}
      disabled={gesperrt}
      className="rounded-lg border border-ifm-lightblue px-2 py-1 text-ifm-blue"
    >
      {STUFEN_FASSUNG.map((s) => (
        <option key={s.wert} value={s.wert}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

/** Auswahl von Deck und Quellpaket, mit Prüfung vor dem Hochladen. */
function DateienWahl({
  knopf,
  gesperrt,
  weiter,
  zusatzOk = true,
}: {
  knopf: string
  gesperrt: boolean
  weiter: (deck: File, quellen: File) => Promise<void> | void
  zusatzOk?: boolean
}) {
  const [deck, setDeck] = useState<File | null>(null)
  const [quellen, setQuellen] = useState<File | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  async function pruefenUndWeiter() {
    if (!deck || !quellen) return
    const deckFehler = deckPruefen(deck.name, deck.size, await deck.text())
    const zipFehler = zipPruefen(quellen.name, quellen.size, new Uint8Array(await quellen.slice(0, 4).arrayBuffer()))
    if (deckFehler || zipFehler) {
      setHinweis(deckFehler ?? zipFehler)
      return
    }
    setHinweis(null)
    await weiter(deck, quellen)
  }

  return (
    <div className="space-y-2 rounded-lg border border-ifm-lightblue p-3 text-xs">
      <label className="block">
        <span className="font-medium text-ifm-gray">Gebautes Deck (HTML aus dist/)</span>
        <input type="file" accept=".html,.htm" onChange={(e) => setDeck(e.target.files?.[0] ?? null)} className="mt-1 block" />
      </label>
      <label className="block">
        <span className="font-medium text-ifm-gray">Quellpaket (der ganze Ordner als Zip)</span>
        <input type="file" accept=".zip" onChange={(e) => setQuellen(e.target.files?.[0] ?? null)} className="mt-1 block" />
      </label>
      {hinweis && <p className="text-ifm-red">{hinweis}</p>}
      <button
        disabled={gesperrt || !deck || !quellen || !zusatzOk}
        onClick={() => void pruefenUndWeiter()}
        className="rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white disabled:opacity-50"
      >
        {gesperrt ? 'Lädt hoch …' : knopf}
      </button>
    </div>
  )
}

function NeueFassung({
  kopierbar,
  namen,
  ichId,
  gesperrt,
  anlegen,
}: {
  kopierbar: Fassung[]
  namen: Map<string, string>
  ichId: string
  gesperrt: boolean
  anlegen: (angaben: { titel: string; bemerkung: string; grundlageId: string; deck: File; quellen: File }) => Promise<void>
}) {
  const [titel, setTitel] = useState('')
  const [bemerkung, setBemerkung] = useState('')
  const [grundlageId, setGrundlageId] = useState('')

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm space-y-3 text-sm">
      <h3 className="font-bold text-ifm-blue">Neue Fassung hochladen</h3>
      <label className="block">
        <span className="text-xs font-medium text-ifm-gray">Titel (z. B. „Mit Praxisbeispielen aus Bayern“)</span>
        <input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-ifm-lightblue p-2"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-ifm-gray">Bemerkung (was ist anders?)</span>
        <textarea
          value={bemerkung}
          onChange={(e) => setBemerkung(e.target.value)}
          maxLength={2000}
          rows={2}
          className="mt-1 w-full rounded-lg border border-ifm-lightblue p-2"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-ifm-gray">Grundlage</span>
        <select
          value={grundlageId}
          onChange={(e) => setGrundlageId(e.target.value)}
          className="mt-1 block rounded-lg border border-ifm-lightblue p-2"
        >
          <option value="">Original des Kurses</option>
          {kopierbar.map((f) => (
            <option key={f.id} value={f.id}>
              „{f.titel}“ {f.besitzer_id === ichId ? '(meine)' : `von ${namen.get(f.besitzer_id) ?? 'Trainer'}`}
            </option>
          ))}
        </select>
      </label>
      <DateienWahl
        knopf="Fassung hochladen"
        gesperrt={gesperrt}
        zusatzOk={titel.trim().length > 0}
        weiter={async (deck, quellen) => {
          await anlegen({ titel, bemerkung, grundlageId, deck, quellen })
          setTitel('')
          setBemerkung('')
          setGrundlageId('')
        }}
      />
      {!titel.trim() && <p className="text-xs text-ifm-gray">Bitte zuerst einen Titel eingeben.</p>}
    </section>
  )
}
