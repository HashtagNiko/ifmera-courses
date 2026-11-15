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
  /** Zeitpunkt der letzten Änderung dieses Stands (Versionsmarke beim Speichern der Notiz); leer = noch nichts gespeichert */
  stand_am: string | null
}

/** Stand eines Tages, wie er gerade in der Datenbank steht */
export interface StandAufServer {
  vermittelt: boolean
  notiz: string
  geaendert_von: string | null
  stand_am: string | null
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

  const stand = new Map<string, StandAufServer>()
  const plan = new Map<string, { trainer_id: string; fassung_id: string | null }>()
  if (durchlaufId) {
    const [{ data: fortschritt, error: fFehler }, { data: planTage, error: pFehler }] = await Promise.all([
      supabase
        .from('fortschritt')
        .select('kurstag_id, vermittelt, notiz, geaendert_von, geaendert_am')
        .eq('durchlauf_id', durchlaufId),
      supabase.from('kt_durchlauf_tage').select('kurstag_id, trainer_id, fassung_id').eq('durchlauf_id', durchlaufId),
    ])
    // Lieber einen Fehler zeigen als alle Tage fälschlich als offen
    if (fFehler) throw new Error(fFehler.message)
    if (pFehler) throw new Error(pFehler.message)
    for (const f of fortschritt ?? []) {
      stand.set(f.kurstag_id as string, standAus(f))
    }
    for (const p of planTage ?? []) {
      plan.set(p.kurstag_id as string, { trainer_id: p.trainer_id as string, fassung_id: (p.fassung_id as string | null) ?? null })
    }
  }

  return (tage ?? []).map((t) => ({
    ...(t as Omit<TagebuchTag, keyof StandAufServer | 'trainer_id' | 'fassung_id'>),
    ...(stand.get(t.id as string) ?? KEIN_STAND),
    trainer_id: plan.get(t.id as string)?.trainer_id ?? null,
    fassung_id: plan.get(t.id as string)?.fassung_id ?? null,
  }))
}

const KEIN_STAND: StandAufServer = { vermittelt: false, notiz: '', geaendert_von: null, stand_am: null }

function standAus(z: Record<string, unknown>): StandAufServer {
  return {
    vermittelt: z.vermittelt === true,
    notiz: (z.notiz as string | null) ?? '',
    geaendert_von: (z.geaendert_von as string | null) ?? null,
    stand_am: (z.geaendert_am as string | null) ?? null,
  }
}

/** Der aktuelle Stand eines Tages in der Datenbank. */
export async function standLaden(durchlaufId: string, kurstagId: string): Promise<StandAufServer> {
  const { data, error } = await supabase
    .from('fortschritt')
    .select('vermittelt, notiz, geaendert_von, geaendert_am')
    .eq('durchlauf_id', durchlaufId)
    .eq('kurstag_id', kurstagId)
  if (error) throw new Error(error.message)
  return data?.[0] ? standAus(data[0]) : KEIN_STAND
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
    const { data, error } = await supabase
      .from('kt_durchlauf_tage')
      .delete()
      .eq('durchlauf_id', durchlaufId)
      .eq('kurstag_id', kurstagId)
      .select('kurstag_id')
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error('Der Tag wurde nicht aus dem Plan genommen.')
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
 * Setzt oder nimmt den Haken eines Tages. Gesendet wird nur der Haken: Arbeiten zwei Trainer gleichzeitig
 * im selben Durchlauf, überschreibt der Haken des einen nicht die Notiz des anderen. `titel_damals` wird
 * mitgeschrieben, damit ein abgeschlossener Durchlauf lesbar bleibt, auch wenn sich der Kurs später
 * ändert. Zeitpunkt und "wer" setzt die Datenbank. Rückgabe: neue Versionsmarke.
 */
export async function hakenSetzen(
  durchlaufId: string,
  tag: Pick<TagebuchTag, 'id' | 'tagebuch_titel'>,
  vermittelt: boolean,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('fortschritt')
    .upsert(
      { durchlauf_id: durchlaufId, kurstag_id: tag.id, vermittelt, titel_damals: tag.tagebuch_titel },
      { onConflict: 'durchlauf_id,kurstag_id' },
    )
    .select('geaendert_am')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Der Haken wurde nicht gespeichert.')
  return (data[0].geaendert_am as string | null) ?? null
}

export type NotizErgebnis =
  | { gespeichert: true; stand_am: string | null }
  | { gespeichert: false; aktuell: StandAufServer }

/**
 * Speichert die Tagesnotiz nur, wenn sie seit `basis` niemand anderes geändert hat (im gemeinsamen
 * Durchlauf können zwei Trainer gleichzeitig schreiben). Hat inzwischen nur jemand abgehakt, die Notiz
 * aber nicht angefasst, wird mit dem neuen Stand erneut gespeichert. Sonst wird nichts überschrieben und
 * der aktuelle Stand zurückgegeben.
 */
export async function notizSpeichern(
  durchlaufId: string,
  tag: Pick<TagebuchTag, 'id' | 'tagebuch_titel'>,
  basis: { notiz: string; stand_am: string | null },
  text: string,
): Promise<NotizErgebnis> {
  let stand = basis.stand_am
  for (let versuch = 0; versuch < 3; versuch++) {
    const neu = await notizSchreiben(durchlaufId, tag, stand, text)
    if (neu.geschrieben) return { gespeichert: true, stand_am: neu.stand_am }
    const aktuell = await standLaden(durchlaufId, tag.id)
    if (aktuell.notiz === text) return { gespeichert: true, stand_am: aktuell.stand_am }
    if (aktuell.notiz !== basis.notiz || aktuell.stand_am === stand) return { gespeichert: false, aktuell }
    stand = aktuell.stand_am
  }
  return { gespeichert: false, aktuell: await standLaden(durchlaufId, tag.id) }
}

async function notizSchreiben(
  durchlaufId: string,
  tag: Pick<TagebuchTag, 'id' | 'tagebuch_titel'>,
  stand: string | null,
  text: string,
): Promise<{ geschrieben: boolean; stand_am: string | null }> {
  if (stand === null) {
    // Noch kein Stand: neu anlegen; legt ihn gerade jemand anderes an, meldet die Datenbank "schon da"
    const { data, error } = await supabase
      .from('fortschritt')
      .insert({ durchlauf_id: durchlaufId, kurstag_id: tag.id, notiz: text, titel_damals: tag.tagebuch_titel })
      .select('geaendert_am')
    if (error?.code === '23505') return { geschrieben: false, stand_am: null }
    if (error) throw new Error(error.message)
    return { geschrieben: Boolean(data?.length), stand_am: (data?.[0]?.geaendert_am as string | null) ?? null }
  }
  const { data, error } = await supabase
    .from('fortschritt')
    .update({ notiz: text, titel_damals: tag.tagebuch_titel })
    .eq('durchlauf_id', durchlaufId)
    .eq('kurstag_id', tag.id)
    .eq('geaendert_am', stand)
    .select('geaendert_am')
  if (error) throw new Error(error.message)
  return { geschrieben: Boolean(data?.length), stand_am: (data?.[0]?.geaendert_am as string | null) ?? null }
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
