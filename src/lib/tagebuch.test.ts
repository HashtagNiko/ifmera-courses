import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Speichern der Tagesnotiz im gemeinsamen Durchlauf: nie die Änderung eines anderen überschreiben.
 * Die Datenbank ist hier eine kleine Nachbildung einer Zeile in `fortschritt`; ihre Versionsmarke
 * (`geaendert_am`) ändert sich bei jeder Änderung, wie es der Trigger in der echten Datenbank tut.
 */

interface Zeile {
  notiz: string
  vermittelt: boolean
  geaendert_von: string | null
  geaendert_am: string
}
const db: {
  zeile: Zeile | null
  zaehler: number
  schreibversuche: number
  vorSchreiben?: () => void
  /** Schreiben ohne Recht: Datenbank aendert 0 Zeilen, ohne Fehler (wie RLS) */
  gesperrt?: boolean
} = {
  zeile: null,
  zaehler: 0,
  schreibversuche: 0,
}

function marke(): string {
  db.zaehler++
  return `2026-11-15T10:00:00.${String(db.zaehler).padStart(6, '0')}+00:00`
}

/** Was ein anderer Trainer zwischendurch tut */
function andererSchreibt(aenderung: Partial<Zeile>) {
  db.zeile = { notiz: '', vermittelt: false, geaendert_von: 'co', ...(db.zeile ?? {}), ...aenderung, geaendert_am: marke() }
}

vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      let art: 'select' | 'insert' | 'update' = 'select'
      let werte: Record<string, unknown> = {}
      const filter: Record<string, unknown> = {}
      const ausfuehren = () => {
        if (art === 'select') return { data: db.zeile ? [{ ...db.zeile }] : [], error: null }
        db.schreibversuche++
        db.vorSchreiben?.()
        if (art === 'insert') {
          if (db.zeile) return { data: null, error: { code: '23505', message: 'doppelt' } }
          db.zeile = { notiz: werte.notiz as string, vermittelt: false, geaendert_von: 'ich', geaendert_am: marke() }
          return { data: [{ geaendert_am: db.zeile.geaendert_am }], error: null }
        }
        if (db.gesperrt) return { data: [], error: null }
        if (!db.zeile || ('geaendert_am' in filter && filter.geaendert_am !== db.zeile.geaendert_am)) return { data: [], error: null }
        db.zeile = { ...db.zeile, notiz: werte.notiz as string, geaendert_am: marke() }
        return { data: [{ geaendert_am: db.zeile.geaendert_am }], error: null }
      }
      const anfrage = {
        select: () => anfrage,
        insert: (w: Record<string, unknown>) => ((art = 'insert'), (werte = w), anfrage),
        update: (w: Record<string, unknown>) => ((art = 'update'), (werte = w), anfrage),
        eq: (k: string, v: unknown) => ((filter[k] = v), anfrage),
        then: (ok: (w: unknown) => unknown, fehl: (e: unknown) => unknown) => Promise.resolve(ausfuehren()).then(ok, fehl),
      }
      return anfrage
    },
  },
}))

const { notizSpeichern } = await import('./tagebuch')
const TAG = { id: 'tag-1', tagebuch_titel: 'Tag 1' }

beforeEach(() => {
  db.zeile = null
  db.zaehler = 0
  db.schreibversuche = 0
  db.vorSchreiben = undefined
  db.gesperrt = false
})

describe('notizSpeichern', () => {
  it('legt den Stand an, wenn es noch keinen gibt', async () => {
    const r = await notizSpeichern('dl', TAG, { notiz: '', stand_am: null }, 'Gruppe war langsam')
    expect(r.gespeichert).toBe(true)
    expect(db.zeile?.notiz).toBe('Gruppe war langsam')
  })

  it('ändert die Notiz, wenn seit dem Laden niemand etwas geändert hat', async () => {
    andererSchreibt({ notiz: 'alt' })
    const basis = { notiz: 'alt', stand_am: db.zeile!.geaendert_am }
    const r = await notizSpeichern('dl', TAG, basis, 'neu')
    expect(r).toEqual({ gespeichert: true, stand_am: db.zeile!.geaendert_am })
    expect(db.zeile?.notiz).toBe('neu')
  })

  it('überschreibt nicht, wenn ein anderer die Notiz inzwischen geändert hat', async () => {
    andererSchreibt({ notiz: 'alt' })
    const basis = { notiz: 'alt', stand_am: db.zeile!.geaendert_am }
    andererSchreibt({ notiz: 'vom Co-Trainer' })
    const r = await notizSpeichern('dl', TAG, basis, 'meins')
    expect(r.gespeichert).toBe(false)
    if (!r.gespeichert) expect(r.aktuell.notiz).toBe('vom Co-Trainer')
    expect(db.zeile?.notiz).toBe('vom Co-Trainer')
  })

  it('speichert trotzdem, wenn ein anderer nur abgehakt hat', async () => {
    andererSchreibt({ notiz: 'alt' })
    const basis = { notiz: 'alt', stand_am: db.zeile!.geaendert_am }
    andererSchreibt({ vermittelt: true })
    const r = await notizSpeichern('dl', TAG, basis, 'meins')
    expect(r.gespeichert).toBe(true)
    expect(db.zeile).toMatchObject({ notiz: 'meins', vermittelt: true })
  })

  it('legt nicht doppelt an: hat ein anderer gerade mit Notiz angelegt, wird nichts überschrieben', async () => {
    const basis = { notiz: '', stand_am: null }
    andererSchreibt({ notiz: 'vom Co-Trainer' })
    const r = await notizSpeichern('dl', TAG, basis, 'meins')
    expect(r.gespeichert).toBe(false)
    expect(db.zeile?.notiz).toBe('vom Co-Trainer')
  })

  it('hat ein anderer gerade nur abgehakt (Zeile neu, Notiz leer), wird gespeichert', async () => {
    const basis = { notiz: '', stand_am: null }
    andererSchreibt({ vermittelt: true })
    const r = await notizSpeichern('dl', TAG, basis, 'meins')
    expect(r.gespeichert).toBe(true)
    expect(db.zeile).toMatchObject({ notiz: 'meins', vermittelt: true })
  })

  it('legt neu an, wenn die Zeile inzwischen gelöscht wurde', async () => {
    andererSchreibt({ notiz: 'alt' })
    const basis = { notiz: 'alt', stand_am: db.zeile!.geaendert_am }
    db.zeile = null
    const r = await notizSpeichern('dl', TAG, basis, 'meins')
    expect(r.gespeichert).toBe(true)
    expect(db.zeile?.notiz).toBe('meins')
  })

  it('meldet fehlendes Recht als Fehler, nicht als Konflikt', async () => {
    andererSchreibt({ notiz: 'alt' })
    const basis = { notiz: 'alt', stand_am: db.zeile!.geaendert_am }
    db.gesperrt = true
    await expect(notizSpeichern('dl', TAG, basis, 'meins')).rejects.toThrow(/Berechtigung/)
    expect(db.zeile?.notiz).toBe('alt')
  })

  it('gibt nach drei Versuchen auf, wenn vor jedem Schreiben jemand abhakt, und überschreibt nichts', async () => {
    andererSchreibt({ notiz: 'alt' })
    const basis = { notiz: 'alt', stand_am: db.zeile!.geaendert_am }
    db.vorSchreiben = () => andererSchreibt({ vermittelt: !db.zeile!.vermittelt })
    const r = await notizSpeichern('dl', TAG, basis, 'meins')
    expect(r.gespeichert).toBe(false)
    expect(db.schreibversuche).toBe(3)
    expect(db.zeile?.notiz).toBe('alt')
  })
})
