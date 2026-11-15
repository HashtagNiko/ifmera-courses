import { supabase } from './supabase'
import type { NotizenModus } from './kurse'

/**
 * Trainer und Freigaben (Baustein 1, SPEC.md).
 *
 * Wer das Kurs-Tool nutzen darf, steht in `kt_trainer`. Nicht verwechseln mit
 * der Tabelle `trainer` des Prüfungstools im selben Supabase-Projekt: dort
 * bekommt jedes Konto automatisch eine Zeile, hier nur, wer freigeschaltet ist.
 *
 * Was hier geprüft wird, ist Bequemlichkeit. Durchgesetzt werden die Rechte von
 * den Regeln in der Datenbank.
 */

export type Rolle = 'admin' | 'trainer'

export interface Trainer {
  id: string
  /** steht in der Fußzeile der Decks und bei fremden Kursen ("von …") */
  anzeigename: string
  rolle: Rolle
  aktiv: boolean
}

export type Stufe = 'nutzen' | 'notizen' | 'fassung'

/** Die Stufen bauen aufeinander auf; jede enthält die davor. */
export const STUFEN: { wert: Stufe; name: string; erklaerung: string }[] = [
  {
    wert: 'nutzen',
    name: 'Ansehen & herunterladen',
    erklaerung: 'Decks öffnen und herunterladen, Tagebuch lesen.',
  },
  {
    wert: 'notizen',
    name: '+ eigene Notizen',
    erklaerung: 'Dazu eigene Notizen zu jeder Folie, die nur er im Cockpit sieht.',
  },
  {
    wert: 'fassung',
    name: '+ eigene Kopie bearbeiten',
    erklaerung: 'Dazu eine eigene Kopie eines Tages mit Claude bearbeiten. Dein Original bleibt unverändert.',
  },
]

export interface Freigabe {
  kurs_id: string
  trainer_id: string
  stufe: Stufe
  /** ausführliche Trainer-Notizen oder nur Stichpunkte (Baustein 7) */
  notiz_umfang: NotizenModus
}

export const NOTIZEN_MODI: { wert: NotizenModus; name: string; erklaerung: string }[] = [
  { wert: 'voll', name: 'Notizen: vollständig', erklaerung: 'deine ausführlichen Trainer-Notizen im Cockpit und in den Dateien.' },
  {
    wert: 'stichpunkte',
    name: 'Notizen: nur Stichpunkte',
    erklaerung: 'statt deiner Notizen nur Stichpunkte, auch im Quellpaket. Gibt es für einen Tag noch keine Stichpunkte, fehlt dort das Trainer-Deck.',
  },
]

/** Eigenes Profil; `null` heißt: nicht für das Kurs-Tool freigeschaltet. */
export async function eigenesProfilLaden(kontoId: string): Promise<Trainer | null> {
  const { data, error } = await supabase
    .from('kt_trainer')
    .select('id, anzeigename, rolle, aktiv')
    .eq('id', kontoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Trainer | null) ?? null
}

/** Alle Trainer, die der Angemeldete sehen darf: er selbst und die aktiven anderen. */
export async function trainerLaden(): Promise<Trainer[]> {
  const { data, error } = await supabase
    .from('kt_trainer')
    .select('id, anzeigename, rolle, aktiv')
    .order('anzeigename')
  if (error) throw new Error(error.message)
  return (data ?? []) as Trainer[]
}

/** Freigaben zu den genannten Kursen; die Datenbank liefert nur, was man sehen darf. */
export async function freigabenLaden(kursIds: string[]): Promise<Freigabe[]> {
  if (kursIds.length === 0) return []
  const { data, error } = await supabase
    .from('kt_kurs_freigaben')
    .select('kurs_id, trainer_id, stufe, notiz_umfang')
    .in('kurs_id', kursIds)
  if (error) throw new Error(error.message)
  return (data ?? []) as Freigabe[]
}

export interface MeineFreigabe {
  stufe: Stufe
  umfang: NotizenModus
}

/** Die eigenen Freigaben: zu welchem fremden Kurs man welche Stufe und welche Notizen hat. */
export async function meineFreigabenLaden(ichId: string): Promise<Map<string, MeineFreigabe>> {
  const { data, error } = await supabase
    .from('kt_kurs_freigaben')
    .select('kurs_id, stufe, notiz_umfang')
    .eq('trainer_id', ichId)
  if (error) throw new Error(error.message)
  return new Map(
    (data ?? []).map((f) => [f.kurs_id as string, { stufe: f.stufe as Stufe, umfang: (f.notiz_umfang as NotizenModus) ?? 'voll' }]),
  )
}

/**
 * Welche Notizen bekommt man in diesem Kurs? Besitzer immer die ausführlichen. Ist die eigene Freigabe
 * (noch) nicht bekannt, lieber die kurze Fassung wählen: Die ausführliche würde die Datenbank dann ohnehin
 * verweigern, und es gäbe einen kaputten Download statt eines klaren Hinweises.
 */
export function notizenModus(besitzerId: string, ichId: string, freigabe: MeineFreigabe | undefined): NotizenModus {
  return besitzerId === ichId ? 'voll' : (freigabe?.umfang ?? 'stichpunkte')
}

/** Darf man an diesem Kurs eigene Notizen schreiben? Besitzer immer, sonst ab Stufe "notizen". */
export function darfNotizen(besitzerId: string, ichId: string, stufe: Stufe | undefined): boolean {
  return besitzerId === ichId || stufe === 'notizen' || stufe === 'fassung'
}

/** Darf man Quellpakete laden und eigene Fassungen anlegen? Besitzer immer, sonst Stufe "fassung". */
export function darfFassung(besitzerId: string, ichId: string, stufe: Stufe | undefined): boolean {
  return besitzerId === ichId || stufe === 'fassung'
}

/**
 * Legt eine Freigabe an oder ändert ihre Stufe.
 *
 * Mit `.select()`: Lehnt eine Regel den Schritt ab, meldet Supabase bei manchen
 * Schreibarten keinen Fehler, sondern einfach keine Zeile. Ohne Rückgabe sähe
 * ein verweigerter Schritt wie ein Erfolg aus (so geschehen beim Löschen im Bucket,
 * 12.09.2026).
 */
export async function freigabeSetzen(
  kursId: string,
  trainerId: string,
  stufe: Stufe,
  umfang: NotizenModus,
): Promise<void> {
  const { data, error } = await supabase
    .from('kt_kurs_freigaben')
    .upsert({ kurs_id: kursId, trainer_id: trainerId, stufe, notiz_umfang: umfang }, { onConflict: 'kurs_id,trainer_id' })
    .select('kurs_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Freigabe wurde nicht gespeichert. Gehört dir der Kurs?')
}

export async function freigabeEntfernen(kursId: string, trainerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('kt_kurs_freigaben')
    .delete()
    .eq('kurs_id', kursId)
    .eq('trainer_id', trainerId)
    .select('kurs_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Freigabe wurde nicht entfernt. Gehört dir der Kurs?')
}
