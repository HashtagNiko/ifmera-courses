import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Profil (Baustein 8): Prüfungen und Ablauf beim Passwortwechsel, mit nachgebildeter Anmeldung. */

const aufrufe: string[] = []
let altesPasswort = 'richtig-und-lang'

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: async ({ password }: { password: string }) => {
        aufrufe.push('anmelden')
        return { error: password === altesPasswort ? null : { message: 'Invalid login credentials' } }
      },
      updateUser: async ({ password }: { password: string }) => {
        aufrufe.push('aendern')
        altesPasswort = password
        return { error: null }
      },
    },
    rpc: async (_name: string, args: { p_name: string }) => ({ data: args.p_name.trim(), error: null }),
  },
}))

const { namePruefen, passwortPruefen, passwortAendern, anzeigenameSetzen } = await import('./profil')

beforeEach(() => {
  aufrufe.length = 0
  altesPasswort = 'richtig-und-lang'
})

describe('Profil', () => {
  it('prüft Namen wie die Datenbank', () => {
    expect(namePruefen('Herr Muster')).toBeNull()
    expect(namePruefen(' X ')).toMatch(/2 bis 60/)
    expect(namePruefen('a'.repeat(61))).toMatch(/2 bis 60/)
    expect(namePruefen('Herr <b>')).toMatch(/spitzen Klammern/)
    expect(namePruefen('Herr ‮Test')).toMatch(/unsichtbaren/)
    expect(namePruefen('​​ab')).toMatch(/unsichtbaren/)
    expect(namePruefen('12 34')).toMatch(/Buchstaben/)
  })

  it('prüft neue Passwörter', () => {
    expect(passwortPruefen('kurz', 'kurz', 'alt')).toMatch(/mindestens 10/)
    expect(passwortPruefen('lang-genug-1', 'lang-genug-2', 'alt')).toMatch(/nicht gleich/)
    expect(passwortPruefen('lang-genug-1', 'lang-genug-1', 'lang-genug-1')).toMatch(/dasselbe/)
    expect(passwortPruefen('lang-genug-1', 'lang-genug-1', 'alt')).toBeNull()
  })

  it('ändert das Passwort nur nach richtigem bisherigen Passwort', async () => {
    await expect(passwortAendern('a@b.invalid', 'falsch', 'neues-passwort-1')).rejects.toThrow(/stimmt nicht/)
    expect(aufrufe).toEqual(['anmelden'])
    await passwortAendern('a@b.invalid', 'richtig-und-lang', 'neues-passwort-1')
    expect(aufrufe).toEqual(['anmelden', 'anmelden', 'aendern'])
    expect(altesPasswort).toBe('neues-passwort-1')
  })

  it('schickt ungültige Namen gar nicht erst an die Datenbank', async () => {
    await expect(anzeigenameSetzen('X')).rejects.toThrow(/2 bis 60/)
    expect(await anzeigenameSetzen('Herr Muster')).toBe('Herr Muster')
  })
})
