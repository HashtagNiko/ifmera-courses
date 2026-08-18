import { supabase } from './supabase'

export interface Kurstag {
  id: string
  nummer: number
  segment: number | null
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
    .select('id, nummer, segment, titel, deck_pfad, deck_aktualisiert_am')
    .eq('kurs_id', kursId)
    .order('nummer')
  if (error) throw new Error(error.message)
  return (data ?? []) as Kurstag[]
}

/**
 * Erzeugt eine zeitlich begrenzte URL für ein Deck im privaten Bucket.
 * Ohne gültige Sitzung und ohne Freigabe liefert Supabase hier einen Fehler,
 * die Decks sind also nicht über eine rateable URL erreichbar.
 */
export async function deckUrl(deckPfad: string, sekunden = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from('decks')
    .createSignedUrl(deckPfad, sekunden)
  if (error || !data) throw new Error(error?.message ?? 'Deck konnte nicht geladen werden.')
  return data.signedUrl
}
