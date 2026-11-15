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
          </ol>

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
