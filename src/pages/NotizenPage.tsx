import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Kopfzeile from '../components/Kopfzeile'
import { folienLesen, notizHtml, type Folie } from '../lib/folien'
import { deckText, kurstagLaden, type KurstagMitKurs } from '../lib/kurse'
import { notizLoeschen, notizSpeichern, notizenLaden, type Notiz } from '../lib/notizen'
import { darfNotizen, meineStufenLaden } from '../lib/trainer'
import { useIch } from '../lib/TrainerContext'

/**
 * Eigene Notizen zu den Folien eines Kurstags (SPEC.md, Baustein 3).
 *
 * Links steht das Original aus dem Deck, rechts die eigene Fassung. Gespeichert
 * wird beim Verlassen eines Feldes. Im Cockpit erscheint die eigene Fassung statt
 * des Originals; das Deck selbst bleibt unverändert. Notizen, deren Folie es nicht
 * mehr gibt (Titel geändert), stehen unten und gehen nicht verloren.
 */
export default function NotizenPage() {
  const { tagId } = useParams()
  // eigener Zustand je Kurstag: wechselt nur die Adresse, beginnt die Seite neu
  return <NotizenSeite key={tagId} tagId={tagId} />
}

function NotizenSeite({ tagId }: { tagId: string | undefined }) {
  const ich = useIch()
  const [tag, setTag] = useState<KurstagMitKurs | null>(null)
  const [folien, setFolien] = useState<Folie[]>([])
  const [notizen, setNotizen] = useState<Map<string, Notiz>>(new Map())
  const [darf, setDarf] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)

  useEffect(() => {
    if (!tagId) return
    let aktiv = true
    ;(async () => {
      const t = await kurstagLaden(tagId)
      if (!t) throw new Error('Diesen Kurstag gibt es nicht, oder er ist nicht für dich freigegeben.')
      if (!t.deck_pfad) throw new Error('Zu diesem Tag gibt es kein Deck.')
      const [html, eigene, stufen] = await Promise.all([
        deckText(t.deck_pfad),
        notizenLaden(t.id),
        meineStufenLaden(ich.id),
      ])
      if (!aktiv) return
      setTag(t)
      setFolien(folienLesen(html))
      setNotizen(new Map(eigene.map((n) => [n.folie_schluessel, n])))
      setDarf(darfNotizen(t.kurse?.besitzer_id ?? '', ich.id, stufen.get(t.kurs_id)))
    })()
      .catch((e: Error) => aktiv && setFehler(e.message))
      .finally(() => aktiv && setLaedt(false))
    return () => {
      aktiv = false
    }
  }, [tagId, ich.id])

  const gespeichert = useCallback((schluessel: string, n: Notiz | null) => {
    setNotizen((alt) => {
      const neu = new Map(alt)
      if (n) neu.set(schluessel, n)
      else neu.delete(schluessel)
      return neu
    })
  }, [])

  // Folien mit noch nicht gespeicherter Eingabe; schließt jemand den Tab, warnt der Browser
  const offen = useRef(new Set<string>())
  const meldeOffen = useCallback((schluessel: string, ja: boolean) => {
    if (ja) offen.current.add(schluessel)
    else offen.current.delete(schluessel)
  }, [])
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (offen.current.size === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warnen)
    return () => window.removeEventListener('beforeunload', warnen)
  }, [])

  const aktuelle = new Set(folien.map((f) => f.schluessel))
  const ohneFolie = [...notizen.values()].filter((n) => !aktuelle.has(n.folie_schluessel))
  const anzahlEigene = [...notizen.keys()].filter((k) => aktuelle.has(k)).length

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Eigene Notizen" />

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <Link to="/kurstage" className="text-sm text-ifm-gray hover:text-ifm-blue">
          ← zurück zu den Kurstagen
        </Link>

        {tag && (
          <h2 className="text-lg font-bold text-ifm-blue">
            {tag.kurse?.name} · Tag {tag.nummer}
            {(tag.titel ?? tag.tagebuch_titel) && ` · ${tag.titel ?? tag.tagebuch_titel}`}
          </h2>
        )}

        <section className="rounded-xl bg-white p-5 shadow-sm text-sm text-ifm-blue space-y-1">
          <p>
            Deine Notizen sieht nur du. Im Cockpit stehen sie statt der Original-Notizen; mit
            „Original-Notizen zeigen“ im Cockpit holst du das Original zurück. Das Deck selbst bleibt
            unverändert.
          </p>
          <p className="text-ifm-gray">
            Formatierung: <code>**fett**</code>, <code>*kursiv*</code>, eine Zeile mit <code>- </code>{' '}
            vorn wird zur Aufzählung. Gespeichert wird, sobald du ein Feld verlässt. Ein leeres Feld
            heißt: dort gilt wieder das Original.
          </p>
        </section>

        {laedt && <p className="text-sm text-ifm-gray">Lädt das Deck …</p>}
        {fehler && <p className="rounded-lg bg-ifm-red/15 text-ifm-blue text-sm p-3">{fehler}</p>}

        {!laedt && tag && !darf && (
          <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
            Für diesen Kurs hast du die Stufe „Ansehen & herunterladen“. Eigene Notizen brauchen die
            Stufe „+ eigene Notizen“; die vergibt der Besitzer des Kurses unter „Freigaben“.
          </p>
        )}

        {!laedt && tag && darf && (
          <>
            <p className="text-sm text-ifm-gray">
              {folien.length} Folien, davon {anzahlEigene} mit eigener Notiz.
            </p>
            {folien.map((f) => (
              <FolieKarte
                key={f.schluessel}
                folie={f}
                notiz={notizen.get(f.schluessel)}
                kurstagId={tag.id}
                ichId={ich.id}
                gespeichert={gespeichert}
                meldeOffen={meldeOffen}
              />
            ))}
          </>
        )}

        {ohneFolie.length > 0 && (
          <section className="rounded-xl bg-white p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-ifm-blue">Notizen ohne Folie</h3>
            <p className="text-sm text-ifm-gray">
              Zu diesen Notizen gibt es im Deck keine passende Folie mehr, meist weil sich ein Titel
              geändert hat. Kopiere den Text bei Bedarf zur richtigen Folie und lösche ihn dann hier.
            </p>
            {ohneFolie.map((n) => (
              <div key={n.id} className="rounded-lg border border-ifm-lightblue p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-ifm-blue">
                    früher Folie {n.folie_nr ?? '?'} · {n.folie_titel ?? n.folie_schluessel}
                  </span>
                  <button
                    onClick={() => {
                      if (!window.confirm('Diese Notiz löschen?')) return
                      notizLoeschen(n.id)
                        .then(() => gespeichert(n.folie_schluessel, null))
                        .catch((e: Error) => setFehler(e.message))
                    }}
                    className="ml-auto text-ifm-gray hover:text-ifm-red"
                  >
                    Löschen
                  </button>
                </div>
                {n.aktion && <p className="mt-2 whitespace-pre-wrap text-ifm-gray">Aktion: {n.aktion}</p>}
                {n.notiz && <p className="mt-1 whitespace-pre-wrap">{n.notiz}</p>}
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}

function FolieKarte({
  folie,
  notiz,
  kurstagId,
  ichId,
  gespeichert,
  meldeOffen,
}: {
  folie: Folie
  notiz: Notiz | undefined
  kurstagId: string
  ichId: string
  gespeichert: (schluessel: string, n: Notiz | null) => void
  meldeOffen: (schluessel: string, ja: boolean) => void
}) {
  const [aktion, setAktion] = useState(notiz?.aktion ?? '')
  const [text, setText] = useState(notiz?.notiz ?? '')
  const [status, setStatus] = useState('')
  // stand = zuletzt gespeichert, eingabe = zuletzt getippt (Refs, damit Speichern nie mit
  // veralteten Werten arbeitet)
  const stand = useRef({ aktion: notiz?.aktion ?? '', notiz: notiz?.notiz ?? '' })
  const eingabe = useRef({ ...stand.current })
  // Speichern nacheinander: eine ältere Speicherung kann so nie eine neuere überholen
  const kette = useRef<Promise<void>>(Promise.resolve())
  const sichtbar = useRef(true)

  function aendern(feld: 'aktion' | 'notiz', wert: string) {
    eingabe.current = { ...eingabe.current, [feld]: wert }
    if (feld === 'aktion') setAktion(wert)
    else setText(wert)
    meldeOffen(folie.schluessel, true)
  }

  function speichern(): Promise<void> {
    kette.current = kette.current.then(async () => {
      const { aktion: a, notiz: n } = eingabe.current
      if (a === stand.current.aktion && n === stand.current.notiz) {
        meldeOffen(folie.schluessel, false)
        return
      }
      if (sichtbar.current) setStatus('speichert …')
      try {
        const neu = await notizSpeichern(ichId, kurstagId, folie, n, a)
        stand.current = { aktion: a, notiz: n }
        gespeichert(folie.schluessel, neu)
        if (eingabe.current.aktion === a && eingabe.current.notiz === n) meldeOffen(folie.schluessel, false)
        if (sichtbar.current) setStatus(neu ? 'gespeichert ✓' : 'Original gilt wieder ✓')
      } catch (e) {
        if (sichtbar.current) setStatus(`Nicht gespeichert: ${(e as Error).message}`)
      }
    })
    return kette.current
  }

  // Wer die Seite verlässt, ohne vorher ein Feld zu verlassen, verliert nichts: beim Abbau speichern
  useEffect(() => {
    sichtbar.current = true
    return () => {
      sichtbar.current = false
      void speichern()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eigen = Boolean(stand.current.aktion.trim() || stand.current.notiz.trim())

  return (
    <section className={`rounded-xl bg-white p-4 shadow-sm border ${eigen ? 'border-ifm-green/50' : 'border-transparent'}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ifm-blue">
          Folie {folie.index + 1} · {folie.titel}
        </span>
        {folie.kann && <span className="rounded bg-ifm-red/15 px-1.5 text-xs text-ifm-blue">KANN</span>}
        {eigen && <span className="rounded bg-ifm-green/15 px-1.5 text-xs text-ifm-blue">eigene Notiz</span>}
        <span className={`ml-auto text-xs ${status.startsWith('Nicht') ? 'text-ifm-red' : 'text-ifm-gray'}`}>{status}</span>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-2 text-xs text-ifm-gray">
          <p className="font-medium uppercase tracking-wide">Original</p>
          {folie.aktion && (
            <p className="max-h-24 overflow-auto rounded bg-ifm-red/10 p-2 whitespace-pre-wrap">
              <span className="font-medium">Aktion:</span> {folie.aktion}
            </p>
          )}
          <p className="max-h-40 overflow-auto rounded bg-ifm-lightblue/60 p-2 whitespace-pre-wrap">
            {folie.notiz || '—'}
          </p>
          <button
            onClick={() => {
              const eigenesDa = eingabe.current.aktion.trim() || eingabe.current.notiz.trim()
              if (eigenesDa && !window.confirm('Deine eigene Notiz zu dieser Folie wird durch das Original ersetzt. Weiter?')) return
              aendern('aktion', folie.aktion)
              aendern('notiz', folie.notiz)
              void speichern()
            }}
            className="text-ifm-blue underline-offset-2 hover:underline"
          >
            Original als Vorlage übernehmen
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ifm-gray">Meine Aktion</span>
            <textarea
              value={aktion}
              onChange={(e) => aendern('aktion', e.target.value)}
              onBlur={() => void speichern()}
              rows={2}
              maxLength={4000}
              className="mt-1 w-full rounded-lg border border-ifm-lightblue p-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ifm-gray">Meine Notiz</span>
            <textarea
              value={text}
              onChange={(e) => aendern('notiz', e.target.value)}
              onBlur={() => void speichern()}
              rows={5}
              maxLength={8000}
              className="mt-1 w-full rounded-lg border border-ifm-lightblue p-2"
            />
          </label>
          {/[*]|^\s*[-•]\s/m.test(text) && (
            <div className="rounded bg-ifm-blue p-2 text-xs text-ifm-cream">
              <p className="mb-1 opacity-70">So erscheint die Notiz im Cockpit:</p>
              {/* notizHtml maskiert zuerst alles und setzt nur fett, kursiv, Aufzählung um */}
              <div dangerouslySetInnerHTML={{ __html: notizHtml(text) }} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
