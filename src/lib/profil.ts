import { supabase } from './supabase'

/**
 * Profil (Baustein 8): eigener Anzeigename und eigenes Passwort.
 *
 * Den Namen ändert die Datenbankfunktion kt_anzeigename_setzen, und zwar nur den eigenen; sie prüft
 * auch Länge und Zeichen. Das Passwort gehört zur Anmeldung (Supabase Auth), die das Kurs-Tool mit dem
 * Prüfungstool teilt: Ein neues Passwort gilt also für beide.
 */

export const NAME_MIN = 2
export const NAME_MAX = 60
export const PASSWORT_MIN = 10

/** Prüft einen Namen wie die Datenbank. Rückgabe: Fehlermeldung oder null. */
export function namePruefen(name: string): string | null {
  const neu = name.replace(/\s+/g, ' ').trim()
  if (neu.length < NAME_MIN || neu.length > NAME_MAX) return `Der Name muss ${NAME_MIN} bis ${NAME_MAX} Zeichen lang sein.`
  // Steuerzeichen, unsichtbare und richtungsdrehende Zeichen, spitze Klammern (wie die Datenbank)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿<>]/.test(neu)) {
    return 'Der Name darf keine spitzen Klammern und keine unsichtbaren Zeichen enthalten.'
  }
  if (!/\p{L}/u.test(neu)) return 'Der Name braucht mindestens einen Buchstaben.'
  return null
}

/** Prüft ein neues Passwort. Rückgabe: Fehlermeldung oder null. */
export function passwortPruefen(neu: string, wiederholt: string, alt: string): string | null {
  if (neu.length < PASSWORT_MIN) return `Das neue Passwort braucht mindestens ${PASSWORT_MIN} Zeichen.`
  if (neu !== wiederholt) return 'Die beiden neuen Passwörter sind nicht gleich.'
  if (neu === alt) return 'Das neue Passwort ist dasselbe wie das bisherige.'
  return null
}

export async function anzeigenameSetzen(name: string): Promise<string> {
  const fehler = namePruefen(name)
  if (fehler) throw new Error(fehler)
  const { data, error } = await supabase.rpc('kt_anzeigename_setzen', { p_name: name })
  if (error) throw new Error(error.message)
  return data as string
}

/**
 * Ändert das Passwort. Vorher wird das bisherige Passwort geprüft (erneut anmelden), damit niemand an
 * einem offen stehenden Rechner das Passwort ändern kann.
 */
export async function passwortAendern(email: string, alt: string, neu: string): Promise<void> {
  const { error: anmeldung } = await supabase.auth.signInWithPassword({ email, password: alt })
  if (anmeldung) throw new Error('Das bisherige Passwort stimmt nicht.')
  const { error } = await supabase.auth.updateUser({ password: neu })
  if (error) throw new Error(`Das Passwort wurde nicht geändert: ${error.message}`)
}
