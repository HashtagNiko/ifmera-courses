import { supabase } from './supabase'

export interface Durchlauf {
  id: string
  name: string
  start_am: string | null
  ende_am: string | null
  aktiv: boolean
  /** Besitzer; bei gemeinsamen Durchläufen (Baustein 5) nicht unbedingt man selbst */
  besitzer_id: string
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
  /** wer den Stand zuletzt geändert hat (setzt die Datenbank) */
  geaendert_von: string | null
  /** Plan des gemeinsamen Durchlaufs: wer den Tag hält, mit welcher Fassung (leer = Original) */
  trainer_id: string | null
  fassung_id: string | null
}

export async function durchlaeufeLaden(kursId: string): Promise<Durchlauf[]> {
  const { data, error } = await supabase
    .from('durchlaeufe')
    .select('id, name, start_am, ende_am, aktiv, besitzer_id')
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
    .select('id, name, start_am, ende_am, aktiv, besitzer_id')
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

  const stand = new Map<string, { vermittelt: boolean; notiz: string | null; geaendert_von: string | null }>()
  const plan = new Map<string, { trainer_id: string; fassung_id: string | null }>()
  if (durchlaufId) {
    const [{ data: fortschritt, error: fFehler }, { data: planTage, error: pFehler }] = await Promise.all([
      supabase.from('fortschritt').select('kurstag_id, vermittelt, notiz, geaendert_von').eq('durchlauf_id', durchlaufId),
      supabase.from('kt_durchlauf_tage').select('kurstag_id, trainer_id, fassung_id').eq('durchlauf_id', durchlaufId),
    ])
    // Lieber einen Fehler zeigen als alle Tage fälschlich als offen
    if (fFehler) throw new Error(fFehler.message)
    if (pFehler) throw new Error(pFehler.message)
    for (const f of fortschritt ?? []) {
      stand.set(f.kurstag_id as string, {
        vermittelt: f.vermittelt as boolean,
        notiz: f.notiz as string | null,
        geaendert_von: (f.geaendert_von as string | null) ?? null,
      })
    }
    for (const p of planTage ?? []) {
      plan.set(p.kurstag_id as string, { trainer_id: p.trainer_id as string, fassung_id: (p.fassung_id as string | null) ?? null })
    }
  }

  return (tage ?? []).map((t) => ({
    ...(t as Omit<TagebuchTag, 'vermittelt' | 'notiz' | 'geaendert_von' | 'trainer_id' | 'fassung_id'>),
    vermittelt: stand.get(t.id as string)?.vermittelt ?? false,
    notiz: stand.get(t.id as string)?.notiz ?? '',
    geaendert_von: stand.get(t.id as string)?.geaendert_von ?? null,
    trainer_id: plan.get(t.id as string)?.trainer_id ?? null,
    fassung_id: plan.get(t.id as string)?.fassung_id ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Gemeinsamer Durchlauf (Baustein 5)
// ---------------------------------------------------------------------------

/** Mitwirkende eines Durchlaufs (ohne den Besitzer). */
export async function mitwirkendeLaden(durchlaufId: string): Promise<string[]> {
  const { data, error } = await supabase.from('kt_durchlauf_trainer').select('trainer_id').eq('durchlauf_id', durchlaufId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((z) => z.trainer_id as string)
}

export async function mitwirkendenAufnehmen(durchlaufId: string, trainerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('kt_durchlauf_trainer')
    .insert({ durchlauf_id: durchlaufId, trainer_id: trainerId })
    .select('trainer_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Nicht aufgenommen. Darf der Trainer den Kurs sehen?')
}

/** Austragen: der Besitzer jeden, ein Mitwirkender sich selbst. */
export async function mitwirkendenAustragen(durchlaufId: string, trainerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('kt_durchlauf_trainer')
    .delete()
    .eq('durchlauf_id', durchlaufId)
    .eq('trainer_id', trainerId)
    .select('trainer_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Nicht ausgetragen.')
}

/**
 * Plan eines Tages: wer ihn hält (leer = Eintrag entfernen). Ändern darf das nur der Besitzer des
 * Durchlaufs; die Datenbank setzt das durch. Ein Wechsel des Trainers setzt die Fassung zurück.
 */
export async function planTrainerSetzen(durchlaufId: string, kurstagId: string, trainerId: string | null): Promise<void> {
  if (!trainerId) {
    const { error } = await supabase.from('kt_durchlauf_tage').delete().eq('durchlauf_id', durchlaufId).eq('kurstag_id', kurstagId)
    if (error) throw new Error(error.message)
    return
  }
  const { data: vorhanden, error: lesefehler } = await supabase
    .from('kt_durchlauf_tage')
    .select('kurstag_id')
    .eq('durchlauf_id', durchlaufId)
    .eq('kurstag_id', kurstagId)
  if (lesefehler) throw new Error(lesefehler.message)
  // Nur den Trainer senden: wechselt er, setzt die Datenbank die Fassung selbst zurück
  const anfrage = vorhanden?.length
    ? supabase
        .from('kt_durchlauf_tage')
        .update({ trainer_id: trainerId })
        .eq('durchlauf_id', durchlaufId)
        .eq('kurstag_id', kurstagId)
        .select('kurstag_id')
    : supabase
        .from('kt_durchlauf_tage')
        .insert({ durchlauf_id: durchlaufId, kurstag_id: kurstagId, trainer_id: trainerId })
        .select('kurstag_id')
  const { data, error } = await anfrage
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Der Plan wurde nicht geändert.')
}

/** Fassung für einen Tag wählen (leer = Original); nur wer den Tag hält, und nur eine eigene Fassung. */
export async function planFassungSetzen(durchlaufId: string, kurstagId: string, fassungId: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('kt_durchlauf_tage')
    .update({ fassung_id: fassungId })
    .eq('durchlauf_id', durchlaufId)
    .eq('kurstag_id', kurstagId)
    .select('kurstag_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Fassung wurde nicht gesetzt.')
}

/**
 * Schreibt den Stand eines Tages im Durchlauf fort. Gesendet wird nur, was sich geändert hat: Arbeiten
 * zwei Trainer gleichzeitig im selben Durchlauf, überschreibt der Haken des einen nicht die Notiz des
 * anderen. `titel_damals` wird mitgeschrieben, damit ein abgeschlossener Durchlauf lesbar bleibt, auch
 * wenn sich der Kurs später ändert. Zeitpunkt und "wer" setzt die Datenbank.
 */
export async function standSetzen(
  durchlaufId: string,
  tag: TagebuchTag,
  aenderung: { vermittelt?: boolean; notiz?: string },
): Promise<void> {
  const zeile: Record<string, unknown> = {
    durchlauf_id: durchlaufId,
    kurstag_id: tag.id,
    titel_damals: tag.tagebuch_titel,
  }
  if (aenderung.vermittelt !== undefined) zeile.vermittelt = aenderung.vermittelt
  if (aenderung.notiz !== undefined) zeile.notiz = aenderung.notiz
  const { error } = await supabase.from('fortschritt').upsert(zeile, { onConflict: 'durchlauf_id,kurstag_id' })
  if (error) throw new Error(error.message)
}

/** Die Ids der Tage, die in diesem Durchlauf als vermittelt markiert sind. */
export async function vermitteltIds(durchlaufId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('fortschritt')
    .select('kurstag_id')
    .eq('durchlauf_id', durchlaufId)
    .eq('vermittelt', true)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((z) => z.kurstag_id as string))
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
