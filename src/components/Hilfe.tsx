import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { STUFEN } from '../lib/trainer'

/**
 * Hilfe (Baustein 6): Knopf „?“ in der Kopfzeile. Zeigt, was auf der aktuellen Seite geht, darunter den
 * ganzen Ablauf und den Weg zum Reiter „Anleitung“ (dort alles ausführlich und die Dateien für Claude).
 * Beim ersten Besuch steht daneben ein kurzer Hinweis auf die Anleitung, bis man ihn wegklickt, die
 * Anleitung oder die Hilfe einmal öffnet (nur in diesem Browser gemerkt).
 */

export type HilfeSeite = 'kurstage' | 'tagebuch' | 'freigaben' | 'notizen' | 'fassungen'
export const SEITEN: HilfeSeite[] = ['kurstage', 'tagebuch', 'freigaben', 'notizen', 'fassungen']

/** Welche Hilfe passt zur Adresse? „/fassungen/123“ → „fassungen“ */
export function seiteAus(pfad: string): HilfeSeite | null {
  const erster = pfad.split('/').filter(Boolean)[0] ?? ''
  return (SEITEN as string[]).includes(erster) ? (erster as HilfeSeite) : null
}

export const EINRICHTUNG_DATEI = '/claude-einrichtung.md'
const GESEHEN = 'ifm-hilfe-gesehen'

function gesehen(): boolean {
  try {
    return window.localStorage.getItem(GESEHEN) === '1'
  } catch {
    return true // ohne Speicher lieber keinen Hinweis, der nie verschwindet
  }
}

function alsGesehenMerken() {
  try {
    window.localStorage.setItem(GESEHEN, '1')
  } catch {
    /* egal: dann erscheint der Hinweis beim nächsten Mal wieder */
  }
}

export default function HilfeKnopf() {
  const seite = seiteAus(useLocation().pathname)
  const [offen, setOffen] = useState(false)
  const [hinweis, setHinweis] = useState(() => !gesehen())

  function oeffnen() {
    setOffen(true)
    setHinweis(false)
    alsGesehenMerken()
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {hinweis && (
        <span className="hidden sm:flex items-center gap-1 rounded-lg bg-ifm-yellow/30 px-2 py-1 text-xs text-ifm-blue">
          Neu hier?{' '}
          <Link
            to="/anleitung"
            onClick={() => {
              setHinweis(false)
              alsGesehenMerken()
            }}
            className="font-medium underline underline-offset-2"
          >
            Unter „Anleitung“
          </Link>{' '}
          steht, wie alles abläuft.
          <button
            onClick={() => {
              setHinweis(false)
              alsGesehenMerken()
            }}
            className="text-ifm-gray hover:text-ifm-blue"
            aria-label="Hinweis schließen"
          >
            ×
          </button>
        </span>
      )}
      <button
        onClick={oeffnen}
        aria-label="Hilfe"
        title="Hilfe: So funktioniert diese Seite"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-ifm-blue text-sm font-bold text-ifm-blue hover:bg-ifm-lightblue"
      >
        ?
      </button>
      {offen && <HilfeFenster seite={seite} schliessen={() => setOffen(false)} />}
    </div>
  )
}

function HilfeFenster({ seite, schliessen }: { seite: HilfeSeite | null; schliessen: () => void }) {
  const zu = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    zu.current?.focus()
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') schliessen()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [schliessen])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ifm-blue/30" onClick={schliessen}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hilfe-titel"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 text-sm text-ifm-blue shadow-xl"
      >
        <div className="flex items-center gap-3">
          <h2 id="hilfe-titel" className="text-lg font-bold">
            Hilfe
          </h2>
          <button ref={zu} onClick={schliessen} className="ml-auto text-ifm-gray hover:text-ifm-blue" aria-label="Hilfe schließen">
            ✕ schließen
          </button>
        </div>

        {seite && (
          <Abschnitt titel={`Auf dieser Seite: ${SEITENTITEL[seite]}`}>
            {SEITENHILFE[seite]}
          </Abschnitt>
        )}

        <Abschnitt titel="So läuft alles ab" aufgeklappt={!seite}>
          <Ablauf />
        </Abschnitt>

        <p className="mt-6 border-t border-ifm-lightblue pt-4">
          Ausführlich, mit allen Seiten und den Dateien für Claude:{' '}
          <Link to="/anleitung" onClick={schliessen} className="font-medium underline underline-offset-2">
            Reiter „Anleitung“
          </Link>
        </p>
      </div>
    </div>
  )
}

function Abschnitt({ titel, children, aufgeklappt = true }: { titel: string; children: ReactNode; aufgeklappt?: boolean }) {
  return (
    <details open={aufgeklappt} className="mt-5 border-t border-ifm-lightblue pt-4">
      <summary className="cursor-pointer font-bold">{titel}</summary>
      <div className="mt-2 space-y-1 leading-relaxed">{children}</div>
    </details>
  )
}

function Liste({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>
}

export const SEITENTITEL: Record<HilfeSeite, string> = {
  kurstage: 'Kurstage',
  tagebuch: 'Trainertagebuch',
  freigaben: 'Freigaben',
  notizen: 'Eigene Notizen',
  fassungen: 'Eigene Fassungen',
}

export const SEITENHILFE: Record<HilfeSeite, ReactNode> = {
  kurstage: (
    <Liste>
      <li>Oben wählst du den Kurs. Jede Kachel ist ein Kurstag.</li>
      <li>
        <b>Klick auf die Kachel</b> öffnet das Deck in einem neuen Fenster. Dort zeigt „🖥 Trainer-Cockpit
        öffnen“ die Notizen zur aktuellen Folie.
      </li>
      <li>
        <b>Herunterladen:</b> „Trainer“ (mit Cockpit und Notizen), „Teilnehmer“ (ohne Notizen), „PDF“ und
        „Quellen“ (das Paket zum Bearbeiten mit Claude). Teilnehmer und PDF gibt es nur für Tage, die schon
        an Teilnehmer ausgegeben sind.
      </li>
      <li>
        <b>✎ Notizen:</b> eigene Notizen zu den Folien, die nur du im Cockpit siehst.
      </li>
      <li>
        <b>⧉ Fassungen:</b> eigene, bearbeitete Kopien dieses Tages. Die Zahl dahinter sagt, wie viele du
        sehen kannst.
      </li>
      <li>Ein grünes ✓ heißt: Im gewählten Durchlauf ist der Tag als vermittelt abgehakt.</li>
      <li>
        Ist der Kurs dir nur freigegeben, steht oben „Freigegeben von …“. Nutzen kannst du ihn, verändern
        nicht. In Decks, die du öffnest oder herunterlädst, steht dein Name in der Fußzeile.
      </li>
    </Liste>
  ),
  tagebuch: (
    <Liste>
      <li>
        Ein <b>Durchlauf</b> ist ein Kursdurchgang mit eigenen Haken. „neuer Durchlauf“ legt einen an; der alte
        bleibt erhalten.
      </li>
      <li>
        <b>Häkchen</b> = Tag vermittelt. „ansehen“ zeigt die Themen und ein Feld für eine Notiz zum Tag.
        „Themen kopieren“ kopiert die Themen für das Trainertagebuch der ifmera.
      </li>
      <li>
        <b>Gemeinsamer Durchlauf:</b> Wer den Durchlauf angelegt hat, nimmt über „Trainer aufnehmen …“ und
        „Aufnehmen“ andere auf (nur Trainer, denen der Kurs freigegeben ist) und legt je Tag fest, wer ihn
        hält („hält:“).
      </li>
      <li>
        Wer einen Tag hält, wählt bei „mit:“ eine eigene Fassung oder das Original. Diese Fassung sehen dann
        alle im Durchlauf (nur zum Ansehen und Herunterladen).
      </li>
      <li>
        Haken und Tagesnotizen sehen und ändern alle im Durchlauf; „abgehakt von …“ zeigt, wer es war.
        Schreiben zwei gleichzeitig, wird nichts überschrieben: Wer später speichert, bekommt einen Hinweis.
      </li>
      <li>Austreten: im Team auf das „×“ neben „ich“.</li>
    </Liste>
  ),
  freigaben: (
    <>
      <p>
        Hier gibst du <b>deine</b> Kurse anderen Trainern frei: Trainer wählen, Stufe wählen, „Freigeben“.
        „Entfernen“ nimmt die Freigabe wieder weg. Verändern kann ein anderer Trainer deinen Kurs nie.
      </p>
      <Liste>
        {STUFEN.map((s) => (
          <li key={s.wert}>
            <b>{s.name}:</b> {s.erklaerung}
          </li>
        ))}
      </Liste>
    </>
  ),
  notizen: (
    <Liste>
      <li>Deine Notizen sieht nur du. Im Cockpit stehen sie statt der Original-Notizen.</li>
      <li>
        Im Cockpit holt das Häkchen „Original-Notizen zeigen (statt meiner eigenen)“ das Original zurück. Das
        Deck selbst bleibt unverändert.
      </li>
      <li>
        Formatierung: <code>**fett**</code>, <code>*kursiv*</code>, eine Zeile mit <code>- </code> vorn wird
        zur Aufzählung. Gespeichert wird, sobald du ein Feld verlässt („gespeichert ✓“).
      </li>
      <li>Ein leeres Feld heißt: Dort gilt wieder das Original. „Original als Vorlage übernehmen“ hilft beim Anfangen.</li>
      <li>
        „Notizen ohne Folie“: Zu diesen Notizen gibt es keine passende Folie mehr, meist weil sich ein Titel
        geändert hat. Text bei Bedarf zur richtigen Folie kopieren.
      </li>
    </Liste>
  ),
  fassungen: (
    <Liste>
      <li>
        <b>So entsteht eine Fassung:</b> „Quellpaket des Originals laden“ (oder einer freigegebenen Fassung),
        mit Claude bearbeiten und bauen, dann unter „Neue Fassung hochladen“ das gebaute Deck (HTML aus
        dist/) und das Quellpaket (der ganze Ordner als Zip) hochladen.
      </li>
      <li>Deine Fassung sieht nur du, bis du sie unten bei „Freigegeben für“ freigibst.</li>
      <li>
        Eigene Fassungen öffnest du im Tool. Fremde Fassungen lädst du herunter und öffnest sie auf deinem
        Rechner; im Tool liefe ein fremdes Deck mit deiner Anmeldung.
      </li>
      <li>
        Ändert sich die Grundlage, erscheint ein gelber Hinweis: neues Quellpaket laden, Claude die Änderungen
        übernehmen lassen, „Neue Version hochladen“, dann „Ist erledigt, …“.
      </li>
      <li>„Löschen“ entfernt die Fassung samt Dateien endgültig.</li>
    </Liste>
  ),
}

export function Ablauf() {
  return (
    <ol className="list-decimal space-y-1 pl-5">
      <li>Wem ein Kurs gehört, der lädt seine Decks hoch und gibt den Kurs unter „Freigaben“ anderen Trainern frei.</li>
      <li>Die Stufe bestimmt, was der andere darf: ansehen und herunterladen, eigene Notizen, eigene Kopie bearbeiten.</li>
      <li>Eigene Notizen und eigene Fassungen gehören dem, der sie anlegt. Das Original bleibt immer unverändert.</li>
      <li>Fassungen kann man einander freigeben, in beide Richtungen, und darauf aufbauen.</li>
      <li>Im Tagebuch hält man Durchläufe fest, auch gemeinsam: wer welchen Tag hält, mit welcher Fassung, was vermittelt ist.</li>
    </ol>
  )
}
