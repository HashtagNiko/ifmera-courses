import type { ReactNode } from 'react'
import Kopfzeile from '../components/Kopfzeile'
import { Ablauf, EINRICHTUNG_DATEI, SEITEN, SEITENHILFE, SEITENTITEL } from '../components/Hilfe'
import paketAnleitung from '../../scripts/quellpaket-anleitung.md?raw'

/**
 * Anleitung (Baustein 6): wie das Kurs-Tool abläuft, jede Seite kurz erklärt, und die Dateien für Claude
 * zum Herunterladen. Die Seitenhilfe ist dieselbe wie hinter dem „?“ (components/Hilfe.tsx), damit es
 * nur einen Text gibt. Die Paket-Anleitung kommt direkt aus scripts/quellpaket-anleitung.md, also genau
 * die Datei, die als CLAUDE.md in jedem Quellpaket liegt.
 */
export default function AnleitungPage() {
  function paketAnleitungLaden() {
    const url = URL.createObjectURL(new Blob([paketAnleitung], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'CLAUDE.md'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="min-h-full bg-ifm-cream">
      <Kopfzeile titel="Anleitung" />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6 text-sm text-ifm-blue">
        <Karte titel="So läuft alles ab">
          <Ablauf />
          <p className="mt-3 text-ifm-gray">
            Auf jeder Seite erklärt das „?“ oben rechts kurz, was dort geht.
          </p>
        </Karte>

        <Karte titel="Mit Claude eigene Fassungen bauen">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Unter „Kurstage“ beim Kurstag auf „Quellen“ klicken (oder „⧉ Fassungen“ → „Quellpaket des
              Originals laden“). Das gibt es mit der Stufe „+ eigene Kopie bearbeiten“.
            </li>
            <li>Das Quellpaket Claude geben und sagen, was sich ändern soll.</li>
            <li>Claude baut daraus ein neues Deck. Im Browser durchklicken, auch das Cockpit.</li>
            <li>
              Unter „⧉ Fassungen“ bei „Neue Fassung hochladen“: Titel, das gebaute Deck (HTML aus dist/) und
              den ganzen Ordner als Zip, dann „Fassung hochladen“.
            </li>
            <li>Wer die Fassung sehen soll, gibst du dort unter „Freigegeben für“ frei.</li>
            <li>
              Für die Teilnehmer: bei der Fassung „Teilnehmer herunterladen“ (HTML ohne Notizen und Cockpit, mit
              deinem Namen in der Fußzeile). Das PDF macht Claude im Paketordner mit{' '}
              <code>python engine/pdf_fassung.py .</code>; das gibst du deinen Teilnehmern selbst weiter.
            </li>
          </ol>

          <h3 className="mt-5 font-bold">So legst du die Dateien ab</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Ein Hauptordner, zum Beispiel <code>Dokumente\ifmera-Fassungen</code>, darin ein Ordner je Kurs und darin
              je Kurstag das entpackte Quellpaket (Name wie im Zip, etwa <code>Tag8_Segment3</code>).
            </li>
            <li>Je Kurstag nur ein Arbeitsordner, keine Kopien daneben. Dort arbeitet Claude mit dir.</li>
            <li>
              Gesichert wird im Tool: Nach jeder fertigen Änderung hochladen („Neue Version hochladen“). Das Tool hält
              den letzten Stand, der Ordner auf deinem Rechner ist die Werkbank.
            </li>
            <li>
              Zeigt eine Fassung den gelben Hinweis „Grundlage geändert“: neues Quellpaket in einen zweiten Ordner
              daneben entpacken, Claude die Änderungen übernehmen lassen, hochladen, den zweiten Ordner löschen.
            </li>
            <li>Claude kennt diese Ordnung: Sie steht auch in der Anleitung in jedem Quellpaket.</li>
          </ul>

          <h3 className="mt-5 font-bold">Dateien</h3>
          <div className="mt-2 space-y-3">
            <Datei
              titel="Einrichtung für Claude"
              text="Einmal am Anfang: Gib diese Datei Claude (Claude-App, claude.ai oder VS Code). Claude fragt, ob du in der App oder in VS Code arbeiten möchtest, und erklärt dir dann Schritt für Schritt das passende Einrichten."
            >
              <a
                href={EINRICHTUNG_DATEI}
                download="ifmera-Claude-Einrichtung.md"
                className="rounded-lg bg-ifm-blue px-3 py-1.5 font-medium text-white"
              >
                Herunterladen
              </a>
            </Datei>
            <Datei
              titel="Anleitung im Quellpaket (CLAUDE.md)"
              text="Zum Nachlesen: Diese Anleitung liegt in jedem Quellpaket und sagt Claude, wie ein Deck aufgebaut ist und wie es gebaut wird."
            >
              <button onClick={paketAnleitungLaden} className="rounded-lg border border-ifm-blue px-3 py-1.5 font-medium">
                Herunterladen
              </button>
            </Datei>
          </div>
        </Karte>

        <Karte titel="Eigenen Kurs anlegen">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Oben unter „Eigene Kurse“ auf „Startpaket herunterladen“ klicken.</li>
            <li>
              Das Zip entpacken, den Ordner nach dem Kurs benennen (zum Beispiel{' '}
              <code>Dokumente\ifmera-Kurse\Brandschutz</code>) und Claude geben. Claude fragt nach Thema,
              Zielgruppe und Kurstagen, schreibt einen Kursplan und baut je Kurstag ein Deck in einem eigenen
              Ordner (<code>Tag1</code>, <code>Tag2</code> …).
            </li>
            <li>Im Tool: „Kurs anlegen“, dann bei „Kurs bearbeiten“ je Kurstag „Tag anlegen“.</li>
            <li>
              Je Tag „Dateien hochladen“: das Deck aus <code>dist/</code>, den Ordner des Tages als Zip und, falls
              Claude eins gemacht hat, das PDF. Die Teilnehmerfassung entsteht im Tool.
            </li>
            <li>
              Der Kurs gehört dir. Unter „Freigaben“ gibst du ihn anderen Trainern frei, genau wie jeden anderen
              Kurs; dann können sie ihn nutzen, eigene Notizen schreiben und eigene Fassungen bauen.
            </li>
          </ol>
          <p className="mt-3 text-ifm-gray">
            Gesichert ist, was im Tool liegt. Der Kursordner auf deinem Rechner bleibt die Werkbank: nicht löschen,
            dort arbeitet Claude weiter.
          </p>
        </Karte>

        <Karte titel="Die Seiten im Überblick">
          <div className="space-y-5">
            {SEITEN.map((s) => (
              <section key={s}>
                <h3 className="font-bold">{SEITENTITEL[s]}</h3>
                <div className="mt-1 leading-relaxed">{SEITENHILFE[s]}</div>
              </section>
            ))}
          </div>
        </Karte>

        <Karte titel="Häufige Fragen">
          <dl className="space-y-3">
            <Frage frage="Ich sehe einen Kurs nicht.">
              Der Kurs ist dir noch nicht freigegeben. Das macht, wem der Kurs gehört, unter „Freigaben“.
            </Frage>
            <Frage frage="Bei mir fehlen „✎ Notizen“, „Quellen“ oder „⧉ Fassungen“.">
              Deine Stufe für diesen Kurs reicht dafür nicht. Notizen gibt es ab „+ eigene Notizen“, Quellen und
              Fassungen ab „+ eigene Kopie bearbeiten“.
            </Frage>
            <Frage frage="Im Cockpit stehen nur Stichpunkte statt Notizen.">
              Der Kurs ist dir mit „Notizen: nur Stichpunkte“ freigegeben. Das legt fest, wem der Kurs gehört,
              unter „Freigaben“. Aktionen und Brücken (Überleitung zur nächsten Folie) stehen vollständig da.
            </Frage>
            <Frage frage="Ein Deck öffnet sich nicht per Klick auf die Kachel.">
              Der Kurs gehört einem anderen Trainer. Solche Decks lädst du über „Trainer“ herunter und öffnest sie
              auf deinem Rechner: Im Tool liefe ein fremdes Deck mit deiner Anmeldung.
            </Frage>
            <Frage frage="Im Schulungsraum ist kein Internet.">
              Lade das Deck vorher unter „Herunterladen: Trainer“ herunter. Die Datei läuft ohne Internet in
              jedem Browser, mit Cockpit und deinen eigenen Notizen.
            </Frage>
          </dl>
        </Karte>
      </main>
    </div>
  )
}

function Karte({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-bold">{titel}</h2>
      {children}
    </section>
  )
}

function Datei({ titel, text, children }: { titel: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-ifm-cream p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{titel}</p>
        <p className="text-ifm-gray">{text}</p>
      </div>
      {children}
    </div>
  )
}

function Frage({ frage, children }: { frage: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium">{frage}</dt>
      <dd className="text-ifm-gray">{children}</dd>
    </div>
  )
}
