// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotizEntwurf, type NotizAnbindung } from './notizEntwurf'
import type { NotizErgebnis, TagebuchTag } from './tagebuch'

/**
 * Entwurf der Tagesnotiz (gemeinsamer Durchlauf): kein Text darf verloren gehen, und gespeichert wird
 * immer auf dem Stand, auf dem der Entwurf beruht.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TAG: TagebuchTag = {
  id: 'tag-1',
  art: 'kurstag',
  nummer: 1,
  position: 1,
  tagebuch_titel: 'Tag 1',
  tagebuch_text: null,
  tagebuch_zeichen: null,
  deck_pfad: null,
  vermittelt: false,
  notiz: 'alt',
  geaendert_von: null,
  trainer_id: null,
  fassung_id: null,
  stand_am: 'v1',
}

/** Ein Speicherauftrag, den der Test selbst beantwortet */
interface Auftrag {
  basis: { notiz: string; stand_am: string | null }
  text: string
  antworten: (e: NotizErgebnis) => Promise<void>
  scheitern: (f: Error) => Promise<void>
}

let root: Root
let feld: ReturnType<typeof useNotizEntwurf>
let auftraege: Auftrag[]
let uebernommen: Array<Record<string, unknown>>
let hinweise: Array<{ art: string; text: string }>
let tag: TagebuchTag

function Probe(props: { tag: TagebuchTag; anbindung: NotizAnbindung }) {
  feld = useNotizEntwurf(props.tag, props.anbindung)
  return null
}

const anbindung: NotizAnbindung = {
  speichern: (basis, text) =>
    new Promise<NotizErgebnis>((ok, fehl) => {
      auftraege.push({
        basis: { ...basis },
        text,
        antworten: async (e) => act(async () => ok(e)),
        scheitern: async (f) => act(async () => fehl(f)),
      })
    }),
  uebernehmen: (stand) => {
    uebernommen.push(stand)
    tag = { ...tag, ...stand }
    zeichnen()
  },
  hinweis: (art, text) => hinweise.push({ art, text }),
}

function zeichnen() {
  root.render(createElement(Probe, { tag, anbindung }))
}

async function tippen(text: string) {
  await act(async () => feld.tippen(text))
}
async function pause() {
  await act(async () => {
    vi.advanceTimersByTime(900)
  })
}

beforeEach(async () => {
  vi.useFakeTimers()
  auftraege = []
  uebernommen = []
  hinweise = []
  tag = { ...TAG }
  root = createRoot(document.createElement('div'))
  await act(async () => zeichnen())
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
})

describe('useNotizEntwurf', () => {
  it('speichert nach einer Pause einmal den neuesten Text, auf dem angezeigten Stand', async () => {
    await tippen('n')
    await tippen('ne')
    await tippen('neu')
    expect(auftraege).toHaveLength(0)
    await pause()
    expect(auftraege).toHaveLength(1)
    expect(auftraege[0]).toMatchObject({ basis: { notiz: 'alt', stand_am: 'v1' }, text: 'neu' })
    await auftraege[0].antworten({ gespeichert: true, stand_am: 'v2' })
    expect(uebernommen.at(-1)).toEqual({ notiz: 'neu', stand_am: 'v2' })
    expect(feld.wert).toBe('neu')
  })

  it('sendet nie zwei Aufträge gleichzeitig; der zweite beruht auf dem Ergebnis des ersten', async () => {
    await tippen('eins')
    await pause()
    await tippen('zwei') // während der erste noch läuft
    await pause()
    expect(auftraege).toHaveLength(1)
    await auftraege[0].antworten({ gespeichert: true, stand_am: 'v2' })
    expect(auftraege).toHaveLength(2)
    expect(auftraege[1]).toMatchObject({ basis: { notiz: 'eins', stand_am: 'v2' }, text: 'zwei' })
    await auftraege[1].antworten({ gespeichert: true, stand_am: 'v3' })
    expect(feld.wert).toBe('zwei')
    expect(tag).toMatchObject({ notiz: 'zwei', stand_am: 'v3' })
  })

  it('Konflikt: zeigt den Stand der Datenbank und nennt den neuesten eigenen Text', async () => {
    await tippen('meins')
    await pause()
    await tippen('meins, länger') // noch nicht gesendet
    await auftraege[0].antworten({
      gespeichert: false,
      aktuell: { notiz: 'vom Co-Trainer', vermittelt: true, geaendert_von: 'co', stand_am: 'v5' },
    })
    expect(hinweise).toEqual([{ art: 'konflikt', text: 'meins, länger' }])
    expect(feld.wert).toBe('vom Co-Trainer')
    await pause()
    expect(auftraege).toHaveLength(1) // der verworfene Entwurf wird nicht mehr gesendet
  })

  it('anderer Fehler: der Text bleibt im Feld und wird beim Verlassen erneut gesendet', async () => {
    await tippen('wichtig')
    await pause()
    await auftraege[0].scheitern(new Error('Netz weg'))
    expect(hinweise).toEqual([{ art: 'fehler', text: 'wichtig' }])
    expect(feld.wert).toBe('wichtig')
    await act(async () => feld.verlassen())
    expect(auftraege).toHaveLength(2)
    expect(auftraege[1]).toMatchObject({ basis: { notiz: 'alt', stand_am: 'v1' }, text: 'wichtig' })
  })

  it('ein neuer Stand von außen ändert nicht die Grundlage eines offenen Entwurfs', async () => {
    await tippen('meins')
    // z. B. Antwort auf einen Haken: anderer Text, neuere Versionsmarke
    tag = { ...tag, notiz: 'vom Co-Trainer', stand_am: 'v7' }
    await act(async () => zeichnen())
    expect(feld.wert).toBe('meins')
    await tippen('meins!') // weitergetippt nach dem neuen Stand
    await pause()
    expect(auftraege[0]).toMatchObject({ basis: { notiz: 'alt', stand_am: 'v1' }, text: 'meins!' })
  })

  it('beim Schließen der Zeile wird ein ausstehender Text noch gesendet', async () => {
    await tippen('kurz vor Schluss')
    await act(async () => root.unmount())
    expect(auftraege).toHaveLength(1)
    expect(auftraege[0].text).toBe('kurz vor Schluss')
    root = createRoot(document.createElement('div')) // für afterEach
  })
})
