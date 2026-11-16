import { supabase } from './supabase'
import { deckPruefen, pruefsumme, zipPruefen } from './fassungen'
import { teilnehmerFassung } from './teilnehmer'
import type { Kurs, Kurstag } from './kurse'

/**
 * Eigene Kurse im Tool (SPEC.md, Baustein 10): Jeder Trainer legt Kurse an, die nur ihm gehören, und lädt
 * je Kurstag das gebaute Deck, das Quellpaket und auf Wunsch das PDF hoch. Die Teilnehmerfassung macht das
 * Tool selbst (wie bei den Fassungen). Ablage im Bucket "decks" unter <kürzel>/<ordner>/<datei>, genau wie
 * bei den Kursen aus dem Deck-Sync; so gelten Freigaben, Notizen, Fassungen und Tagebuch unverändert.
 *
 * Was jemand darf, entscheidet die Datenbank (Besitz, Kürzel- und Pfadprüfung, Migration
 * 20261116100000); hier wird nur vorbereitet und verständlich gemeldet.
 */

const BUCKET = 'decks'
export const KUERZEL_MUSTER = /^[a-z0-9][a-z0-9-]{1,39}$/
export const KURSNAME_MIN = 2
export const KURSNAME_MAX = 80
export const TITEL_MAX = 120
export const GRENZE_PDF = 30 * 1024 * 1024

export interface EigenerKurs extends Kurs {
  angelegt_im_tool: boolean
}

export type Tagesart = Kurstag['art']

export const TAGESARTEN: { wert: Tagesart; name: string }[] = [
  { wert: 'kurstag', name: 'Kurstag' },
  { wert: 'projekttag', name: 'Projekttag' },
  { wert: 'pruefung', name: 'Abschlussprüfung' },
]

/** Kursname wie die Datenbank ihn speichert: Leerraum zusammengezogen, außen ohne. */
export function kursnameBereinigen(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

/** Prüft einen Kursnamen wie die Datenbank. Rückgabe: Fehlermeldung oder null. */
export function kursnamePruefen(name: string): string | null {
  const neu = kursnameBereinigen(name)
  if (neu.length < KURSNAME_MIN || neu.length > KURSNAME_MAX) {
    return `Der Kursname braucht ${KURSNAME_MIN} bis ${KURSNAME_MAX} Zeichen.`
  }
  // Steuerzeichen, unsichtbare und richtungsdrehende Zeichen, spitze Klammern (wie die Datenbank)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff<>]/.test(neu)) {
    return 'Der Kursname darf keine spitzen Klammern und keine unsichtbaren Zeichen enthalten.'
  }
  return null
}

/** Prüft einen Tagestitel. Rückgabe: Fehlermeldung oder null. */
export function titelPruefen(titel: string): string | null {
  const neu = titel.replace(/\s+/g, ' ').trim()
  if (!neu) return 'Bitte einen Titel eingeben.'
  if (neu.length > TITEL_MAX) return `Der Titel darf höchstens ${TITEL_MAX} Zeichen haben.`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff<>]/.test(neu)) {
    return 'Der Titel darf keine spitzen Klammern und keine unsichtbaren Zeichen enthalten.'
  }
  return null
}

const ZEICHEN = 'abcdefghijkmnpqrstuvwxyz23456789'

function zufallsTeil(laenge = 5): string {
  const zahlen = new Uint8Array(laenge)
  crypto.getRandomValues(zahlen)
  return Array.from(zahlen, (z) => ZEICHEN[z % ZEICHEN.length]).join('')
}

/**
 * Kürzel für einen neuen Kurs: lesbarer Teil aus dem Namen plus Zufall, etwa "brandschutz-k3m9x". Das
 * Kürzel ist nur der Ordnername im Speicher; es bleibt für immer und ist nirgends zu sehen. Der Zufall
 * verhindert, dass zwei Trainer dasselbe wählen.
 */
export function kuerzelVorschlag(name: string, zufall = zufallsTeil()): string {
  const basis = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 24)
    .replace(/-+$/, '')
  return `${basis || 'kurs'}-${zufall}`
}

/** Dateiname eines Tages im Speicher, ohne Endung: "Tag3", "Projekttag1", "Pruefung1". */
export function dateiStamm(art: Tagesart, nummer: number): string {
  if (art === 'projekttag') return `Projekttag${nummer}`
  if (art === 'pruefung') return `Pruefung${nummer}`
  return `Tag${nummer}`
}

export function tagPfade(kuerzel: string, art: Tagesart, nummer: number) {
  const stamm = dateiStamm(art, nummer)
  return {
    trainer: `${kuerzel}/trainer/${stamm}.html`,
    teilnehmer: `${kuerzel}/teilnehmer/${stamm}.html`,
    pdf: `${kuerzel}/pdf/${stamm}.pdf`,
    quellen: `${kuerzel}/quellen/${stamm}.zip`,
  }
}

/** Name beim Herunterladen, etwa "Tag 3 - Brandschutz im Bestand" (ohne Zeichen, die Windows verbietet). */
export function liefername(art: Tagesart, nummer: number, titel: string): string {
  const vorn = art === 'projekttag' ? `Projekttag ${nummer}` : art === 'pruefung' ? 'Abschlussprüfung' : `Tag ${nummer}`
  const sauber = titel
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100)
  return sauber ? `${vorn} - ${sauber}` : vorn
}

/** Prüft ein PDF (Endung, Größe, Kennung "%PDF"). Rückgabe: Fehlermeldung oder null. */
export function pdfPruefen(name: string, groesse: number, anfang: Uint8Array): string | null {
  if (!/\.pdf$/i.test(name)) return 'Das PDF muss eine PDF-Datei sein.'
  if (groesse > GRENZE_PDF) return `Das PDF ist größer als ${GRENZE_PDF / 1024 / 1024} MB.`
  if (!(anfang[0] === 0x25 && anfang[1] === 0x50 && anfang[2] === 0x44 && anfang[3] === 0x46)) {
    return 'Diese Datei ist kein gültiges PDF.'
  }
  return null
}

/** Verständliche Meldung zu einem Datenbankfehler. */
function meldung(error: { code?: string; message: string }, wobei: string): Error {
  if (error.code === '23503') {
    return new Error(
      `${wobei} geht nicht: Zu diesem Kurstag gibt es noch Fassungen (auch von Trainern, denen du den Kurs ` +
        'freigegeben hast). Erst wenn sie gelöscht sind, lässt er sich löschen.',
    )
  }
  if (error.code === '2BP01') {
    return new Error(`${wobei} geht nicht: Es liegen noch Dateien des Kurses im Speicher. Bitte noch einmal versuchen.`)
  }
  if (error.code === '23505') return new Error(`${wobei} geht nicht: Diesen Eintrag gibt es schon.`)
  if (error.code === '42501') return new Error(`${wobei} geht nicht: Dafür fehlt dir das Recht.`)
  return new Error(error.message)
}

// ---------------------------------------------------------------------------
// Kurse
// ---------------------------------------------------------------------------

/** Eigene, im Tool angelegte Kurse (die aus dem Deck-Sync pflegt ihr Besitzer in den Kursordnern). */
export async function eigeneKurseLaden(ichId: string): Promise<EigenerKurs[]> {
  const { data, error } = await supabase
    .from('kurse')
    .select('id, slug, name, besitzer_id, angelegt_im_tool')
    .eq('besitzer_id', ichId)
    .eq('angelegt_im_tool', true)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as EigenerKurs[]
}

export async function eigenenKursLaden(id: string): Promise<EigenerKurs | null> {
  const { data, error } = await supabase
    .from('kurse')
    .select('id, slug, name, besitzer_id, angelegt_im_tool')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as EigenerKurs | null) ?? null
}

/** Legt einen Kurs an. Ist das Kürzel zufällig schon vergeben (oder durch alte Dateien belegt), neu würfeln. */
export async function kursAnlegen(ichId: string, name: string): Promise<EigenerKurs> {
  const fehler = kursnamePruefen(name)
  if (fehler) throw new Error(fehler)
  for (let versuch = 0; versuch < 3; versuch++) {
    const { data, error } = await supabase
      .from('kurse')
      .insert({ slug: kuerzelVorschlag(name), name: kursnameBereinigen(name), besitzer_id: ichId, angelegt_im_tool: true })
      .select('id, slug, name, besitzer_id, angelegt_im_tool')
    if (error?.code === '23505') continue
    if (error) throw meldung(error, 'Kurs anlegen')
    if (!data?.length) throw new Error('Der Kurs wurde nicht angelegt.')
    return data[0] as EigenerKurs
  }
  throw new Error('Der Kurs wurde nicht angelegt. Bitte noch einmal versuchen.')
}

export async function kursUmbenennen(id: string, name: string): Promise<void> {
  const fehler = kursnamePruefen(name)
  if (fehler) throw new Error(fehler)
  const { data, error } = await supabase.from('kurse').update({ name: kursnameBereinigen(name) }).eq('id', id).select('id')
  if (error) throw meldung(error, 'Umbenennen')
  if (!data?.length) throw new Error('Der Name wurde nicht gespeichert.')
}

/**
 * Alle Dateien eines Kurses im Speicher (je Unterordner eine Abfrage). Die Datenbank lässt einen Kurs erst
 * löschen, wenn darunter keine Dateien mehr liegen (keine verwaisten Dateien, Migration 20261116100000).
 */
async function kursDateien(kuerzel: string): Promise<string[]> {
  const pfade: string[] = []
  for (const ordner of ['trainer', 'teilnehmer', 'pdf', 'quellen', 'trainer-kurz', 'quellen-kurz']) {
    const { data, error } = await supabase.storage.from(BUCKET).list(`${kuerzel}/${ordner}`, { limit: 1000 })
    if (error) throw new Error(error.message)
    for (const d of data ?? []) if (d.id) pfade.push(`${kuerzel}/${ordner}/${d.name}`)
  }
  return pfade
}

async function dateienEntfernen(pfade: string[]): Promise<void> {
  if (pfade.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(pfade)
  if (error) throw new Error(`Dateien konnten nicht gelöscht werden: ${error.message}`)
}

/**
 * Löscht einen eigenen Kurs mit allem, was dazugehört (Kurstage, Dateien, Freigaben, Tagebücher).
 * Reihenfolge: erst die Kurstage in einem Schritt (gibt es zu einem Tag noch Fassungen, bricht das ab und
 * nichts ist verloren), dann die Dateien (solange der Kurs besteht, darf der Besitzer sie löschen), zuletzt
 * der Kurs. Bricht es zwischendurch ab, bleibt der Kurs stehen und lässt sich erneut löschen.
 */
export async function kursLoeschen(kurs: { id: string; slug: string }): Promise<void> {
  const { error: tagFehler } = await supabase.from('kurstage').delete().eq('kurs_id', kurs.id)
  if (tagFehler) throw meldung(tagFehler, 'Löschen')
  await dateienEntfernen(await kursDateien(kurs.slug))
  const { data, error } = await supabase.from('kurse').delete().eq('id', kurs.id).select('id')
  if (error) throw meldung(error, 'Löschen')
  if (!data?.length) throw new Error('Der Kurs wurde nicht gelöscht.')
}

// ---------------------------------------------------------------------------
// Kurstage
// ---------------------------------------------------------------------------

export interface TagAngaben {
  art: Tagesart
  nummer: number
  titel: string
  /** Abschnitt (Segment), optional: Nummer und Name, etwa 2 und "Technik" */
  segment: number | null
  segment_titel: string | null
}

export interface EigenerTag {
  id: string
  art: Tagesart
  nummer: number
  titel: string | null
  segment: number | null
  segment_titel: string | null
  deck_pfad: string | null
  deck_aktualisiert_am: string | null
  teilnehmer_pfad: string | null
  pdf_pfad: string | null
  quellen_pfad: string | null
}

const TAG_SPALTEN =
  'id, art, nummer, titel, segment, segment_titel, deck_pfad, deck_aktualisiert_am, teilnehmer_pfad, pdf_pfad, quellen_pfad'

export async function eigeneTageLaden(kursId: string): Promise<EigenerTag[]> {
  const { data, error } = await supabase
    .from('kurstage')
    .select(TAG_SPALTEN)
    .eq('kurs_id', kursId)
    .order('segment', { nullsFirst: true })
    .order('art')
    .order('nummer')
  if (error) throw new Error(error.message)
  return (data ?? []) as EigenerTag[]
}

function angabenPruefen(a: TagAngaben): TagAngaben {
  if (!Number.isInteger(a.nummer) || a.nummer < 1 || a.nummer > 999) throw new Error('Die Nummer muss zwischen 1 und 999 liegen.')
  const fehler = titelPruefen(a.titel)
  if (fehler) throw new Error(fehler)
  if (a.segment !== null && (!Number.isInteger(a.segment) || a.segment < 1 || a.segment > 99)) {
    throw new Error('Der Abschnitt muss eine Zahl zwischen 1 und 99 sein.')
  }
  const segTitel = a.segment_titel?.replace(/\s+/g, ' ').trim() || null
  if (segTitel) {
    const f = titelPruefen(segTitel)
    if (f) throw new Error(`Abschnitt: ${f}`)
  }
  return { ...a, titel: a.titel.replace(/\s+/g, ' ').trim(), segment_titel: a.segment === null ? null : segTitel }
}

export async function tagAnlegen(kursId: string, angaben: TagAngaben): Promise<void> {
  const a = angabenPruefen(angaben)
  const { data, error } = await supabase
    .from('kurstage')
    .insert({
      kurs_id: kursId,
      art: a.art,
      nummer: a.nummer,
      titel: a.titel,
      segment: a.segment,
      segment_titel: a.segment_titel,
      liefername: liefername(a.art, a.nummer, a.titel),
    })
    .select('id')
  if (error?.code === '23505') throw new Error('Diesen Tag gibt es in diesem Kurs schon (gleiche Art und Nummer).')
  if (error) throw meldung(error, 'Tag anlegen')
  if (!data?.length) throw new Error('Der Tag wurde nicht angelegt.')
}

/** Titel und Abschnitt ändern. Art und Nummer bleiben (an ihnen hängen die Dateinamen). */
export async function tagAendern(tag: EigenerTag, angaben: Omit<TagAngaben, 'art' | 'nummer'>): Promise<void> {
  const a = angabenPruefen({ ...angaben, art: tag.art, nummer: tag.nummer })
  const { data, error } = await supabase
    .from('kurstage')
    .update({
      titel: a.titel,
      segment: a.segment,
      segment_titel: a.segment_titel,
      liefername: liefername(tag.art, tag.nummer, a.titel),
    })
    .eq('id', tag.id)
    .select('id')
  if (error) throw meldung(error, 'Speichern')
  if (!data?.length) throw new Error('Nicht gespeichert.')
}

async function hochladen(pfad: string, inhalt: Blob, typ: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(pfad, inhalt, { contentType: typ, upsert: true, cacheControl: '0' })
  if (error) throw new Error(`Hochladen fehlgeschlagen: ${error.message}`)
}

/**
 * Prüft die Dateien eines Tages und macht die Teilnehmerfassung. Bleibt darin etwas Trainerhaftes stehen
 * (Notizen, Aktionen, Brücken, Cockpit-Knopf), wird nichts hochgeladen: Die Fassung bekämen Teilnehmer.
 */
export async function tagDateienVorbereiten(dateien: { deck: File; quellen: File; pdf: File | null }) {
  const deckText = await dateien.deck.text()
  const fehler =
    deckPruefen(dateien.deck.name, dateien.deck.size, deckText) ??
    zipPruefen(dateien.quellen.name, dateien.quellen.size, new Uint8Array(await dateien.quellen.slice(0, 4).arrayBuffer())) ??
    (dateien.pdf ? pdfPruefen(dateien.pdf.name, dateien.pdf.size, new Uint8Array(await dateien.pdf.slice(0, 4).arrayBuffer())) : null)
  if (fehler) throw new Error(fehler)
  const { html, bericht } = teilnehmerFassung(deckText)
  if (bericht.offen.length) {
    throw new Error(
      `Die Teilnehmerfassung ließ sich nicht sauber erzeugen (${bericht.offen.join(', ')}). ` +
        'Bitte das Deck mit der Engine aus dem Startpaket bauen.',
    )
  }
  return { teilnehmer: new Blob([html], { type: 'text/html;charset=utf-8' }) }
}

/**
 * Lädt Deck, Quellpaket, Teilnehmerfassung und (optional) PDF eines Tages hoch und trägt Pfade und
 * Prüfsummen ein. Ohne neues PDF fällt ein altes weg: Es passte nicht mehr zum neuen Deck.
 */
export async function tagDateienSetzen(
  kurs: { slug: string },
  tag: EigenerTag,
  dateien: { deck: File; quellen: File; pdf: File | null },
): Promise<void> {
  const { teilnehmer } = await tagDateienVorbereiten(dateien)
  const p = tagPfade(kurs.slug, tag.art, tag.nummer)
  const [deckHash, quellenHash, tnHash, pdfHash] = await Promise.all([
    pruefsumme(await dateien.deck.arrayBuffer()),
    pruefsumme(await dateien.quellen.arrayBuffer()),
    pruefsumme(await teilnehmer.arrayBuffer()),
    dateien.pdf ? pruefsumme(await dateien.pdf.arrayBuffer()) : Promise.resolve(null),
  ])
  await hochladen(p.trainer, dateien.deck, 'text/html; charset=utf-8')
  await hochladen(p.teilnehmer, teilnehmer, 'text/html; charset=utf-8')
  await hochladen(p.quellen, dateien.quellen, 'application/zip')
  if (dateien.pdf) await hochladen(p.pdf, dateien.pdf, 'application/pdf')

  const { data, error } = await supabase
    .from('kurstage')
    .update({
      deck_pfad: p.trainer,
      deck_hash: deckHash,
      deck_groesse: dateien.deck.size,
      deck_aktualisiert_am: new Date().toISOString(),
      teilnehmer_pfad: p.teilnehmer,
      teilnehmer_hash: tnHash,
      teilnehmer_groesse: teilnehmer.size,
      quellen_pfad: p.quellen,
      quellen_hash: quellenHash,
      quellen_groesse: dateien.quellen.size,
      pdf_pfad: dateien.pdf ? p.pdf : null,
      pdf_hash: pdfHash,
      pdf_groesse: dateien.pdf ? dateien.pdf.size : null,
    })
    .eq('id', tag.id)
    .select('id')
  if (error) throw meldung(error, 'Speichern')
  if (!data?.length) throw new Error('Die Dateien wurden hochgeladen, aber nicht beim Tag eingetragen.')
  if (!dateien.pdf && tag.pdf_pfad) await dateienEntfernen([tag.pdf_pfad]).catch(() => undefined)
}

/** Löscht einen Tag: erst die Zeile (scheitert, solange es Fassungen gibt), dann seine Dateien. */
export async function tagLoeschen(tag: EigenerTag): Promise<void> {
  const { data, error } = await supabase.from('kurstage').delete().eq('id', tag.id).select('id')
  if (error) throw meldung(error, 'Löschen')
  if (!data?.length) throw new Error('Der Tag wurde nicht gelöscht.')
  const pfade = [tag.deck_pfad, tag.teilnehmer_pfad, tag.pdf_pfad, tag.quellen_pfad].filter((p): p is string => Boolean(p))
  await dateienEntfernen(pfade)
}

/** Das Startpaket für Claude (Bucket "kt-vorlagen", vom Admin per Deck-Sync gepflegt). */
export const STARTPAKET_BUCKET = 'kt-vorlagen' as const
export const STARTPAKET_PFAD = 'startpaket.zip'
export const STARTPAKET_NAME = 'ifmera-Startpaket.zip'
