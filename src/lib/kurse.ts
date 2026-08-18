import { supabase } from './supabase'

export interface Kurstag {
  id: string
  nummer: number
  segment: number | null
  /** Name des Segments aus dem Deck-Titel, z. B. "Rechtliche Grundlagen" */
  segment_titel: string | null
  titel: string | null
  deck_pfad: string | null
  deck_aktualisiert_am: string | null
}

export interface Kurs {
  id: string
  slug: string
  name: string
}

/**
 * Prüft, ob der angemeldete Nutzer für das Kurs-Tool freigeschaltet ist.
 * Das Supabase-Projekt teilen wir mit dem Prüfungstool, in dem auch andere
 * Trainer Konten haben. Die Freigabe steuert allein die Tabelle `kurs_zugriff`;
 * RLS setzt dieselbe Regel serverseitig durch.
 */
export async function hatZugriff(): Promise<boolean> {
  const { data, error } = await supabase.from('kurs_zugriff').select('trainer_id').limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}

export async function kurseLaden(): Promise<Kurs[]> {
  const { data, error } = await supabase.from('kurse').select('id, slug, name').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Kurs[]
}

export async function kurstageLaden(kursId: string): Promise<Kurstag[]> {
  const { data, error } = await supabase
    .from('kurstage')
    .select('id, nummer, segment, segment_titel, titel, deck_pfad, deck_aktualisiert_am')
    .eq('kurs_id', kursId)
    .order('nummer')
  if (error) throw new Error(error.message)
  return (data ?? []) as Kurstag[]
}

/**
 * Lädt ein Deck aus dem privaten Bucket und gibt eine lokale Adresse darauf
 * zurück (blob:).
 *
 * Der Umweg ist nötig, weil Supabase HTML immer als `text/plain` ausliefert,
 * egal was beim Upload angegeben wird; das ist deren Schutz gegen fremden Code
 * auf der geteilten supabase.co-Domain. Über die eigene Adresse geöffnet stimmt
 * der Typ, und das Trainer-Cockpit des Decks funktioniert, weil Deck und
 * Cockpit dann dieselbe Herkunft haben.
 *
 * Ohne gültige Sitzung und ohne Freigabe verweigert Supabase den Download, die
 * Decks bleiben also geschützt.
 */
export async function deckLaden(deckPfad: string): Promise<string> {
  const { data, error } = await supabase.storage.from('decks').download(deckPfad)
  if (error || !data) throw new Error(error?.message ?? 'Deck konnte nicht geladen werden.')
  const html = new Blob([await data.arrayBuffer()], { type: 'text/html;charset=utf-8' })
  return URL.createObjectURL(html)
}
