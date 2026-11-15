import { useCallback, useEffect, useRef, useState } from 'react'
import type { NotizErgebnis, StandAufServer, TagebuchTag } from './tagebuch'

export interface NotizAnbindung {
  /** speichert mit Versionsprüfung (lib/tagebuch.ts) */
  speichern: (basis: { notiz: string; stand_am: string | null }, text: string) => Promise<NotizErgebnis>
  /** übernimmt einen Stand der Datenbank in die Anzeige */
  uebernehmen: (stand: Partial<StandAufServer>) => void
  hinweis: (art: 'konflikt' | 'fehler', text: string, meldung?: string) => void
}

/**
 * Entwurf der Tagesnotiz. Tippen ändert nur das Feld; gespeichert wird nach einer kurzen Pause, beim
 * Verlassen des Feldes und beim Schließen der Zeile, immer nacheinander. Der Entwurf merkt sich den Stand
 * der Datenbank, auf dem er beruht (`basis`), und speichert nur, wenn ihn seither niemand geändert hat.
 *   * Konflikt: Entwurf verwerfen, Stand der Datenbank zeigen, den neuesten eigenen Text in der Meldung nennen.
 *   * anderer Fehler: Entwurf bleibt im Feld und wird beim nächsten Verlassen erneut gesendet.
 */
export function useNotizEntwurf(tag: TagebuchTag, anbindung: NotizAnbindung) {
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const ausstehend = useRef<string | null>(null) // noch nicht gesendeter Text
  const basis = useRef<{ notiz: string; stand_am: string | null } | null>(null) // null = kein Entwurf offen
  const laeuft = useRef(false)
  const uhr = useRef<number | undefined>(undefined)
  const tagRef = useRef(tag)
  const anbindungRef = useRef(anbindung)
  useEffect(() => {
    tagRef.current = tag
    anbindungRef.current = anbindung
  })

  const senden = useCallback(async () => {
    if (laeuft.current) return // der laufende Durchgang nimmt neuere Eingaben mit
    laeuft.current = true
    try {
      while (ausstehend.current !== null && basis.current) {
        const text = ausstehend.current
        ausstehend.current = null
        if (text === basis.current.notiz) continue
        let ergebnis: NotizErgebnis
        try {
          ergebnis = await anbindungRef.current.speichern(basis.current, text)
        } catch (e) {
          if (ausstehend.current === null) ausstehend.current = text
          anbindungRef.current.hinweis('fehler', text, (e as Error).message)
          return
        }
        if (ergebnis.gespeichert) {
          basis.current = { notiz: text, stand_am: ergebnis.stand_am }
          continue
        }
        // Konflikt: nichts überschreiben; den neuesten eigenen Text nennen, dann den Stand der Datenbank zeigen
        const neuester = ausstehend.current ?? text
        window.clearTimeout(uhr.current)
        ausstehend.current = null
        basis.current = null
        anbindungRef.current.uebernehmen(ergebnis.aktuell)
        setEntwurf(null)
        anbindungRef.current.hinweis('konflikt', neuester)
        return
      }
      // Alles gespeichert: Anzeige auf den gespeicherten Stand, Entwurf schließen
      if (ausstehend.current === null && basis.current) {
        const gespeichert = basis.current
        basis.current = null
        anbindungRef.current.uebernehmen({ notiz: gespeichert.notiz, stand_am: gespeichert.stand_am })
        setEntwurf(null)
      }
    } finally {
      laeuft.current = false
    }
  }, [])

  const jetztSichern = useCallback(() => {
    window.clearTimeout(uhr.current)
    uhr.current = undefined
    void senden()
  }, [senden])

  function tippen(text: string) {
    // Erster Tastendruck: der Entwurf beruht auf dem Stand, der gerade angezeigt wird
    if (!basis.current) basis.current = { notiz: tagRef.current.notiz, stand_am: tagRef.current.stand_am }
    setEntwurf(text)
    ausstehend.current = text
    window.clearTimeout(uhr.current)
    uhr.current = window.setTimeout(jetztSichern, 800)
  }

  // Beim Verlassen der Seite warnen, beim Schließen der Zeile noch speichern
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (ausstehend.current !== null || laeuft.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warnen)
    return () => {
      window.removeEventListener('beforeunload', warnen)
      jetztSichern()
    }
  }, [jetztSichern])

  return { wert: entwurf ?? tag.notiz, tippen, verlassen: jetztSichern }
}
