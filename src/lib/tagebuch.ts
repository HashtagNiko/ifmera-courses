import { supabase } from './supabase'

export interface Durchlauf {
  id: string
  name: string
  start_am: string | null
  ende_am: string | null
  aktiv: boolean
}

export type Tagesart = 'kurstag' | 'projekttag' | 'pruefung'

export interface TagebuchTag {
  id: string
  art: Tagesart
  nummer: number
  position: number | null
  tagebuch_titel: string | null
  tagebuch_text: string | null
  tagebuch_zeichen: number | null
  deck_pfad: string | null
  /** Stand im gewählten Durchlauf */
  vermittelt: boolean
  notiz: string
}

export async function durchlaeufeLaden(kursId: string): Promise<Durchlauf[]> {
  const { data, error } = await supabase
    .from('durchlaeufe')
    .select('id, name, start_am, ende_am, aktiv')
    .eq('kurs_id', kursId)
    .order('start_am', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Durchlauf[]
}

export async function durchlaufAnlegen(
  kursId: string,
  name: string,
  start: string | null,
  ende: string | null,
): Promise<Durchlauf> {
  const { data, error } = await supabase
    .from('durchlaeufe')
    .insert({ kurs_id: kursId, name, start_am: start || null, ende_am: ende || null })
    .select('id, name, start_am, ende_am, aktiv')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Durchlauf konnte nicht angelegt werden.')
  return data as Durchlauf
}

/**
 * Lädt alle Tage eines Kurses in Kursreihenfolge und mischt den Fortschritt des
 * gewählten Durchlaufs dazu. Ohne Durchlauf sind alle Tage schlicht offen.
 */
export async function tageLaden(kursId: string, durchlaufId: string | null): Promise<TagebuchTag[]> {
  const { data: tage, error } = await supabase
    .from('kurstage')
    .select('id, art, nummer, position, tagebuch_titel, tagebuch_text, tagebuch_zeichen, deck_pfad')
    .eq('kurs_id', kursId)
    .order('position', { nullsFirst: false })
    .order('nummer')
  if (error) throw new Error(error.message)

  const stand = new Map<string, { vermittelt: boolean; notiz: string | null }>()
  if (durchlaufId) {
    const { data: fortschritt } = await supabase
      .from('fortschritt')
      .select('kurstag_id, vermittelt, notiz')
      .eq('durchlauf_id', durchlaufId)
    for (const f of fortschritt ?? []) {
      stand.set(f.kurstag_id as string, {
        vermittelt: f.vermittelt as boolean,
        notiz: f.notiz as string | null,
      })
    }
  }

  return (tage ?? []).map((t) => ({
    ...(t as Omit<TagebuchTag, 'vermittelt' | 'notiz'>),
    vermittelt: stand.get(t.id as string)?.vermittelt ?? false,
    notiz: stand.get(t.id as string)?.notiz ?? '',
  }))
}

/**
 * Schreibt den Stand eines Tages im Durchlauf fort. `titel_damals` wird
 * mitgeschrieben, damit ein abgeschlossener Durchlauf lesbar bleibt, auch wenn
 * sich der Kurs später ändert.
 */
export async function standSetzen(
  durchlaufId: string,
  tag: TagebuchTag,
  aenderung: { vermittelt?: boolean; notiz?: string },
): Promise<void> {
  const { error } = await supabase.from('fortschritt').upsert(
    {
      durchlauf_id: durchlaufId,
      kurstag_id: tag.id,
      vermittelt: aenderung.vermittelt ?? tag.vermittelt,
      notiz: aenderung.notiz ?? tag.notiz,
      titel_damals: tag.tagebuch_titel,
      geaendert_am: new Date().toISOString(),
    },
    { onConflict: 'durchlauf_id,kurstag_id' },
  )
  if (error) throw new Error(error.message)
}

/** Der Text, der ins Trainertagebuch kopiert wird: ein Punkt je Zeile. */
export function kopiertext(tag: TagebuchTag): string {
  if (!tag.tagebuch_text) return ''
  return tag.tagebuch_text
    .split('\n')
    .map((z) => `– ${z}`)
    .join('\n')
}

export function tagesBezeichnung(tag: TagebuchTag): string {
  if (tag.art === 'pruefung') return 'Abschlussprüfung'
  if (tag.art === 'projekttag') return `Projekttag ${tag.nummer}`
  return `Kurstag ${tag.nummer}`
}
