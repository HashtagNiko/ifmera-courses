import { supabase } from './supabase'

/**
 * Eigene Fassungen eines Kurstags (SPEC.md, Baustein 4): bearbeitete Kopien, in beide Richtungen.
 * Tabellen kt_deck_fassungen und kt_fassung_freigaben, Dateien im privaten Bucket "fassungen" unter
 * <besitzer-id>/<fassung-id>/deck.html und quellen.zip. Was jemand sehen und tun darf, entscheidet die
 * Datenbank; die App zeigt nur an.
 */

export const BUCKET_FASSUNGEN = 'fassungen'
export type FassungStufe = 'nutzen' | 'fassung'

export interface Fassung {
  id: string
  besitzer_id: string
  kurstag_id: string
  grundlage_art: 'original' | 'fassung'
  /** leer bei grundlage_art 'fassung' heißt: die Grundlage wurde inzwischen gelöscht */
  grundlage_fassung_id: string | null
  grundlage_hash: string | null
  titel: string
  bemerkung: string
  deck_pfad: string | null
  deck_groesse: number | null
  quellen_pfad: string | null
  quellen_hash: string | null
  angelegt_am: string
  geaendert_am: string
}

export interface FassungFreigabe {
  fassung_id: string
  trainer_id: string
  stufe: FassungStufe
}

const SPALTEN =
  'id, besitzer_id, kurstag_id, grundlage_art, grundlage_fassung_id, grundlage_hash, titel, bemerkung, deck_pfad, deck_groesse, quellen_pfad, quellen_hash, angelegt_am, geaendert_am'

export const GRENZE_DECK = 20 * 1024 * 1024
export const GRENZE_ZIP = 40 * 1024 * 1024

/** Prüft, ob eine Datei ein gebautes Deck ist. Rückgabe: Fehlermeldung oder null. */
export function deckPruefen(name: string, groesse: number, text: string): string | null {
  if (!/\.html?$/i.test(name)) return 'Das Deck muss eine HTML-Datei sein (aus dem Ordner dist/).'
  if (groesse > GRENZE_DECK) return `Das Deck ist größer als ${GRENZE_DECK / 1024 / 1024} MB.`
  if (!/<section[^>]*class=["']?[^"'>]*\bslide\b/i.test(text)) {
    return 'In dieser Datei sind keine Folien. Bitte das gebaute Deck aus dist/ wählen, nicht eine Folienquelle.'
  }
  return null
}

/** Prüft, ob eine Datei ein Zip ist (Kennung "PK\x03\x04" am Anfang). Rückgabe: Fehlermeldung oder null. */
export function zipPruefen(name: string, groesse: number, anfang: Uint8Array): string | null {
  if (!/\.zip$/i.test(name)) return 'Das Quellpaket muss eine Zip-Datei sein.'
  if (groesse > GRENZE_ZIP) return `Das Quellpaket ist größer als ${GRENZE_ZIP / 1024 / 1024} MB.`
  if (!(anfang[0] === 0x50 && anfang[1] === 0x4b && anfang[2] === 0x03 && anfang[3] === 0x04)) {
    return 'Diese Datei ist kein gültiges Zip.'
  }
  return null
}

export async function pruefsumme(daten: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', daten)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Alle Fassungen zu einem Kurstag, die man sehen darf (eigene und freigegebene). */
export async function fassungenLaden(kurstagId: string): Promise<Fassung[]> {
  const { data, error } = await supabase
    .from('kt_deck_fassungen')
    .select(SPALTEN)
    .eq('kurstag_id', kurstagId)
    .order('angelegt_am')
  if (error) throw new Error(error.message)
  return (data ?? []) as Fassung[]
}

/** Zu welchen dieser Kurstage es sichtbare Fassungen gibt (für die Kacheln). */
export async function fassungenZaehlen(kurstagIds: string[]): Promise<Map<string, number>> {
  if (kurstagIds.length === 0) return new Map()
  const { data, error } = await supabase.from('kt_deck_fassungen').select('kurstag_id').in('kurstag_id', kurstagIds)
  if (error) throw new Error(error.message)
  const zahl = new Map<string, number>()
  for (const z of data ?? []) zahl.set(z.kurstag_id as string, (zahl.get(z.kurstag_id as string) ?? 0) + 1)
  return zahl
}

/** Freigaben, die man sehen darf: zu eigenen Fassungen alle, zu fremden nur die eigene. */
export async function fassungsFreigabenLaden(fassungIds: string[]): Promise<FassungFreigabe[]> {
  if (fassungIds.length === 0) return []
  const { data, error } = await supabase
    .from('kt_fassung_freigaben')
    .select('fassung_id, trainer_id, stufe')
    .in('fassung_id', fassungIds)
  if (error) throw new Error(error.message)
  return (data ?? []) as FassungFreigabe[]
}

/** Darf ein anderer Trainer den Kurs sehen? Damit stehen beim Freigeben nur passende Trainer zur Auswahl. */
export async function kursZugangVon(trainerId: string, kursId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('kt_kurs_zugang_von', { p_trainer_id: trainerId, p_kurs_id: kursId })
  if (error) throw new Error(error.message)
  return data === true
}

async function hochladen(pfad: string, datei: File, typ: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_FASSUNGEN)
    .upload(pfad, datei, { contentType: typ, upsert: true, cacheControl: '0' })
  if (error) throw new Error(`Hochladen fehlgeschlagen: ${error.message}`)
}

/**
 * Legt eine Fassung an: erst die Zeile (die Datenbank prüft, ob man das darf), dann die beiden
 * Dateien in den eigenen Ordner, dann Pfade und Prüfsummen. Schlägt ein Schritt fehl, wird
 * aufgeräumt, damit keine halbe Fassung stehen bleibt.
 */
export async function fassungAnlegen(
  ichId: string,
  angaben: {
    kurstagId: string
    titel: string
    bemerkung: string
    grundlageFassungId: string | null
    grundlageHash: string | null
    deck: File
    quellen: File
  },
): Promise<Fassung> {
  const { data, error } = await supabase
    .from('kt_deck_fassungen')
    .insert({
      kurstag_id: angaben.kurstagId,
      titel: angaben.titel.trim(),
      bemerkung: angaben.bemerkung,
      grundlage_art: angaben.grundlageFassungId ? 'fassung' : 'original',
      grundlage_fassung_id: angaben.grundlageFassungId,
      grundlage_hash: angaben.grundlageHash,
    })
    .select('id')
  if (error) throw new Error(error.message)
  const id = data?.[0]?.id as string | undefined
  if (!id) throw new Error('Die Fassung wurde nicht angelegt. Hast du für diesen Kurs die Stufe „+ eigene Kopie bearbeiten“?')
  try {
    return await dateienSetzen(ichId, id, angaben.deck, angaben.quellen)
  } catch (e) {
    await fassungLoeschen(ichId, id).catch(() => undefined)
    throw e
  }
}

/** Neue Version einer eigenen Fassung: Dateien ersetzen, Pfade und Prüfsummen nachziehen. */
export async function dateienSetzen(ichId: string, id: string, deck: File, quellen: File): Promise<Fassung> {
  const deckPfad = `${ichId}/${id}/deck.html`
  const quellenPfad = `${ichId}/${id}/quellen.zip`
  const [deckHash, quellenHash] = await Promise.all([
    pruefsumme(await deck.arrayBuffer()),
    pruefsumme(await quellen.arrayBuffer()),
  ])
  await hochladen(deckPfad, deck, 'text/html; charset=utf-8')
  await hochladen(quellenPfad, quellen, 'application/zip')
  const { data, error } = await supabase
    .from('kt_deck_fassungen')
    .update({
      deck_pfad: deckPfad,
      deck_hash: deckHash,
      deck_groesse: deck.size,
      quellen_pfad: quellenPfad,
      quellen_hash: quellenHash,
      quellen_groesse: quellen.size,
    })
    .eq('id', id)
    .select(SPALTEN)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Fassung wurde nicht gespeichert.')
  return data[0] as Fassung
}

/** Markiert eine Fassung als auf dem Stand ihrer Grundlage (nachdem man deren Änderungen übernommen hat). */
export async function aufStandSetzen(id: string, grundlageHash: string): Promise<void> {
  const { data, error } = await supabase
    .from('kt_deck_fassungen')
    .update({ grundlage_hash: grundlageHash })
    .eq('id', id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Nicht gespeichert.')
}

/** Löscht eine eigene Fassung samt Dateien. */
export async function fassungLoeschen(ichId: string, id: string): Promise<void> {
  // Erst die Dateien (der eigene Ordner bleibt löschbar), dann die Zeile
  const { error: dateiFehler } = await supabase.storage
    .from(BUCKET_FASSUNGEN)
    .remove([`${ichId}/${id}/deck.html`, `${ichId}/${id}/quellen.zip`])
  if (dateiFehler) throw new Error(dateiFehler.message)
  const { data, error } = await supabase.from('kt_deck_fassungen').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Fassung wurde nicht gelöscht.')
}

export async function fassungFreigeben(fassungId: string, trainerId: string, stufe: FassungStufe): Promise<void> {
  const { data, error } = await supabase
    .from('kt_fassung_freigaben')
    .upsert({ fassung_id: fassungId, trainer_id: trainerId, stufe }, { onConflict: 'fassung_id,trainer_id' })
    .select('fassung_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Nicht freigegeben. Hat der Trainer Zugang zu diesem Kurs?')
}

export async function fassungsFreigabeEntfernen(fassungId: string, trainerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('kt_fassung_freigaben')
    .delete()
    .eq('fassung_id', fassungId)
    .eq('trainer_id', trainerId)
    .select('fassung_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Die Freigabe wurde nicht entfernt.')
}
