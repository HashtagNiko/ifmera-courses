import { supabase } from './supabase'
import type { EigeneNotiz, Folie } from './folien'

/**
 * Eigene Notizen je Folie (Tabelle kt_folien_notizen, SPEC.md Baustein 3).
 * Die Datenbank liefert und ändert nur die eigenen Notizen; Schreiben braucht für
 * fremde Kurse mindestens die Stufe "notizen".
 */

export interface Notiz extends EigeneNotiz {
  id: string
  kurstag_id: string
  folie_titel: string | null
  folie_nr: number | null
  geaendert_am: string
}

const SPALTEN = 'id, kurstag_id, folie_schluessel, folie_titel, folie_nr, notiz, aktion, geaendert_am'

export async function notizenLaden(kurstagId: string): Promise<Notiz[]> {
  const { data, error } = await supabase.from('kt_folien_notizen').select(SPALTEN).eq('kurstag_id', kurstagId)
  if (error) throw new Error(error.message)
  return (data ?? []) as Notiz[]
}

/**
 * Speichert Notiz und Aktion zu einer Folie. Sind beide leer, wird die Notiz
 * gelöscht; das Cockpit zeigt dann wieder das Original.
 */
export async function notizSpeichern(
  ichId: string,
  kurstagId: string,
  folie: Pick<Folie, 'schluessel' | 'titel' | 'index'>,
  notiz: string,
  aktion: string,
): Promise<Notiz | null> {
  if (!notiz.trim() && !aktion.trim()) {
    const { error } = await supabase
      .from('kt_folien_notizen')
      .delete()
      .eq('trainer_id', ichId)
      .eq('kurstag_id', kurstagId)
      .eq('folie_schluessel', folie.schluessel)
    if (error) throw new Error(error.message)
    return null
  }
  // Mit Rückgabe: Lehnt die Datenbank ab, kommt sonst womöglich nur "keine Zeile" zurück.
  const { data, error } = await supabase
    .from('kt_folien_notizen')
    .upsert(
      {
        trainer_id: ichId,
        kurstag_id: kurstagId,
        folie_schluessel: folie.schluessel,
        folie_titel: folie.titel.slice(0, 300),
        folie_nr: folie.index + 1,
        notiz,
        aktion,
      },
      { onConflict: 'trainer_id,kurstag_id,folie_schluessel' },
    )
    .select(SPALTEN)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Notiz wurde nicht gespeichert.')
  return data[0] as Notiz
}

export async function notizLoeschen(id: string): Promise<void> {
  const { data, error } = await supabase.from('kt_folien_notizen').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Notiz wurde nicht gelöscht.')
}
