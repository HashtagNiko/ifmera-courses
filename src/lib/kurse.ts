import { supabase, supabaseAnonKey, supabaseUrl } from './supabase'
import { deckAnpassen, type DeckAnpassung } from './deckAnpassung'
import { notizenEinsetzen, type EigeneNotiz } from './folien'
import { notizenLaden } from './notizen'

export interface Kurstag {
  id: string
  art: 'kurstag' | 'projekttag' | 'pruefung'
  nummer: number
  /** Rang in der Kursreihenfolge; Projekttage sitzen zwischen den Kurstagen */
  position: number | null
  segment: number | null
  /** Name des Segments aus dem Deck-Titel, z. B. "Rechtliche Grundlagen" */
  segment_titel: string | null
  titel: string | null
  /** Titel aus der Themenuebersicht; bei Tagen ohne Deck der einzige Titel */
  tagebuch_titel: string | null
  deck_pfad: string | null
  deck_aktualisiert_am: string | null
  /** Name wie in "2. Slides", ohne Endung; leer, wenn der Tag dort nicht liegt */
  liefername: string | null
  /** Teilnehmerfassung und PDF; nur gesetzt, wenn sie ausgegeben werden (im Lieferordner liegen) */
  teilnehmer_pfad: string | null
  pdf_pfad: string | null
  /** Quellpaket (Zip) zum Bearbeiten mit Claude; lesbar ab Stufe "fassung" (Baustein 4) */
  quellen_pfad: string | null
}

export type DownloadArt = 'trainer' | 'teilnehmer' | 'pdf' | 'quellen'

export interface Kurs {
  id: string
  slug: string
  name: string
  /** Trainer, dem der Kurs gehört (kt_trainer.id) */
  besitzer_id: string
}

/** Alle Kurse, die der Angemeldete sehen darf: eigene und freigegebene. */
export async function kurseLaden(): Promise<Kurs[]> {
  const { data, error } = await supabase.from('kurse').select('id, slug, name, besitzer_id').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Kurs[]
}

export async function kurstageLaden(kursId: string): Promise<Kurstag[]> {
  const { data, error } = await supabase
    .from('kurstage')
    // Eine einzelne Zeichenkette, nicht zusammengesetzt: supabase-js leitet die
    // Typen aus dem Literal ab und verliert sie bei einer Verkettung.
    .select('id, art, nummer, position, segment, segment_titel, titel, tagebuch_titel, deck_pfad, deck_aktualisiert_am, liefername, teilnehmer_pfad, pdf_pfad, quellen_pfad')
    .eq('kurs_id', kursId)
    .order('position', { nullsFirst: false })
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
 *
 * Geladen wird am Cache vorbei: Supabase liefert Objekte mit einer Cache-Dauer
 * aus (bis 04.10.2026 eine Stunde), und der Browser zeigte nach einem Update
 * noch das alte Deck. `cache: 'no-store'` umgeht den Browser-Cache, der
 * Zeitstempel in der Adresse den CDN-Cache; deshalb nicht mehr
 * `storage.download()`, das beides nicht kennt.
 */
export async function deckLaden(
  deckPfad: string,
  anpassung?: DeckAnpassung,
  kurstagId?: string,
  /** "fassungen" für eigene Fassungen (Baustein 4) */
  bucket: Bucket = 'decks',
): Promise<string> {
  const notizen = notizenHolen(kurstagId) // läuft parallel zum Herunterladen des Decks
  const antwort = await ausDemBucket(deckPfad, bucket)
  const angepasst = mitNotizen(deckAnpassen(await antwort.text(), anpassung), await notizen)
  const html = new Blob([ergaenzeVollbild(angepasst)], { type: 'text/html;charset=utf-8' })
  return URL.createObjectURL(html)
}

/** Das Deck als Text, unverändert (für die Notizen-Seite). */
export async function deckText(deckPfad: string): Promise<string> {
  return (await ausDemBucket(deckPfad)).text()
}

/**
 * Eigene Notizen des Angemeldeten zu einem Kurstag (Baustein 3). Gelingt das Laden
 * nicht, öffnet sich das Deck trotzdem, mit den Original-Notizen.
 */
async function notizenHolen(kurstagId?: string): Promise<EigeneNotiz[]> {
  if (!kurstagId) return []
  try {
    return await notizenLaden(kurstagId)
  } catch {
    return []
  }
}

/**
 * Setzt die Notizen zuletzt ein, nach Name und Markierung: So kann der Namenstausch
 * in der Fußzeile nie in die eingebetteten Notizdaten greifen.
 */
function mitNotizen(html: string, notizen: EigeneNotiz[]): string {
  return notizen.length ? notizenEinsetzen(html, notizen) : html
}

export interface KurstagMitKurs {
  id: string
  art: Kurstag['art']
  nummer: number
  titel: string | null
  tagebuch_titel: string | null
  deck_pfad: string | null
  liefername: string | null
  quellen_pfad: string | null
  quellen_hash: string | null
  kurs_id: string
  kurse: { name: string; besitzer_id: string } | null
}

export async function kurstagLaden(id: string): Promise<KurstagMitKurs | null> {
  const { data, error } = await supabase
    .from('kurstage')
    .select('id, art, nummer, titel, tagebuch_titel, deck_pfad, liefername, quellen_pfad, quellen_hash, kurs_id, kurse(name, besitzer_id)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as KurstagMitKurs | null
}

export type Bucket = 'decks' | 'fassungen'

/** Holt eine Datei aus einem privaten Bucket, am Cache vorbei (siehe deckLaden). */
async function ausDemBucket(pfad: string, bucket: Bucket = 'decks'): Promise<Response> {
  const { data: sitzung } = await supabase.auth.getSession()
  const token = sitzung.session?.access_token
  if (!token || !supabaseUrl || !supabaseAnonKey) throw new Error('Nicht angemeldet.')
  const kodiert = pfad.split('/').map(encodeURIComponent).join('/')
  const antwort = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${kodiert}?v=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    cache: 'no-store',
  })
  if (!antwort.ok) throw new Error(`Datei konnte nicht geladen werden (${antwort.status}).`)
  return antwort
}

/**
 * Dateiname beim Herunterladen: der Liefername aus "2. Slides", wie Niko ihn auch
 * selbst ausgibt. Trainer- und Teilnehmerfassung tragen dort denselben Namen und
 * unterscheiden sich nur durch den Ordner; beim Herunterladen landen beide im selben
 * Ordner, deshalb bekommt die Trainerfassung einen Zusatz.
 */
export function downloadName(tag: Kurstag, art: DownloadArt): string {
  const basis = tag.liefername ?? `Tag ${tag.nummer}`
  if (art === 'trainer') return `${basis} (Trainerfassung).html`
  if (art === 'teilnehmer') return `${basis}.html`
  if (art === 'quellen') return `${basis} (Quellen).zip`
  return `${basis}.pdf`
}

/**
 * Lädt eine Datei aus dem Bucket herunter, ohne den Vollbild-Knopf, den nur das
 * Öffnen im Tool ergänzt. HTML-Dateien bekommen die Anpassungen (Name in der
 * Fußzeile bei fremden Decks, unsichtbare Markierung); ein PDF bleibt unverändert,
 * dort steht weiter der Name des Besitzers.
 */
export async function dateiHerunterladen(
  pfad: string,
  dateiname: string,
  anpassung?: DeckAnpassung,
  /** nur bei der Trainerfassung: eigene Notizen mit hineinnehmen */
  kurstagId?: string,
  bucket: Bucket = 'decks',
): Promise<void> {
  // Nur HTML wird angepasst; PDF und Zip kommen unverändert
  const istHtml = dateiname.endsWith('.html')
  const notizen = istHtml ? notizenHolen(kurstagId) : Promise.resolve([])
  const antwort = await ausDemBucket(pfad, bucket)
  // Supabase liefert HTML als text/plain aus; der Typ richtet sich deshalb nach der Endung.
  const inhalt = istHtml
    ? mitNotizen(deckAnpassen(await antwort.text(), anpassung), await notizen)
    : await antwort.arrayBuffer()
  const typ = istHtml
    ? 'text/html;charset=utf-8'
    : dateiname.endsWith('.zip')
      ? 'application/zip'
      : 'application/pdf'
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }))
  const link = document.createElement('a')
  link.href = url
  link.download = dateiname
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Hängt dem Deck einen Vollbild-Knopf an.
 *
 * Die Decks bringen zwar einen Präsentationsmodus mit, der schaltet aber nur
 * eine CSS-Klasse um; echtes Vollbild fordert er nie an. Das muss aus dem Deck
 * selbst heraus geschehen, weil Browser Vollbild nur auf eine Nutzeraktion im
 * betroffenen Dokument hin erlauben. Geändert wird nur diese Kopie im Browser,
 * die Datei im Bucket und im Kursordner bleibt, wie sie ist.
 */
function ergaenzeVollbild(html: string): string {
  const stelle = html.lastIndexOf('</body>')
  return stelle === -1 ? html + VOLLBILD_KNOPF : html.slice(0, stelle) + VOLLBILD_KNOPF + html.slice(stelle)
}

const VOLLBILD_KNOPF = `
<button id="ifmVollbild" title="Vollbild (auch F11)" style="position:fixed;top:10px;right:12px;
z-index:9999;border:none;cursor:pointer;font:500 12.5px Ubuntu,Arial,sans-serif;background:#04211f;
color:#faf5eb;border-radius:6px;padding:7px 12px;box-shadow:0 1px 4px rgba(0,0,0,.3);opacity:.85">
⛶ Vollbild</button>
<script>
(function () {
  var knopf = document.getElementById('ifmVollbild')
  var frist = null

  knopf.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  })

  /**
   * Im Vollbild verschwindet der Knopf vollstaendig. Der Bildschirm wird im
   * Kurs geteilt, und was hier stehen bleibt, sehen die Teilnehmer mit.
   * Zurueck kommt er nur, wenn die Maus in die obere rechte Ecke faehrt.
   */
  function verstecken() {
    knopf.style.opacity = '0'
    knopf.style.pointerEvents = 'none'
  }
  function zeigen() {
    knopf.style.opacity = '.85'
    knopf.style.pointerEvents = 'auto'
  }

  document.addEventListener('fullscreenchange', function () {
    knopf.textContent = document.fullscreenElement ? '⛶ Vollbild beenden' : '⛶ Vollbild'
    if (document.fullscreenElement) verstecken()
    else zeigen()
  })

  document.addEventListener('mousemove', function (e) {
    if (!document.fullscreenElement) return
    var inDerEcke = e.clientY < 90 && e.clientX > window.innerWidth - 220
    if (!inDerEcke) return
    zeigen()
    window.clearTimeout(frist)
    frist = window.setTimeout(verstecken, 2500)
  })
})()
</script>`
