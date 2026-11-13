/**
 * Anpassungen an der Kopie eines Decks im Browser (SPEC.md, Baustein 2).
 *
 * Geändert wird nie die Datei im Bucket oder im Kursordner, nur die Kopie, die
 * geöffnet oder heruntergeladen wird. Alles hier ist reine Textverarbeitung ohne
 * Zugriff auf Supabase, damit es sich ohne Netz testen lässt
 * (src/lib/deckAnpassung.test.ts).
 */

export interface DeckAnpassung {
  /**
   * Fremdes Deck: In der Fußzeile steht der Name des Betrachters statt des
   * Besitzers ("© ifmera academy GmbH | Herr Krnic" → "… | <eigener Name>").
   */
  fussName?: { von: string; nach: string }
  /** Unsichtbare Markierung (Kommentar und meta-Tag), nur beim Herunterladen. */
  markierung?: string
}

const FUSS_PRAEFIX = '© ifmera academy GmbH | '

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Ersetzt den Namen in der Fußzeile. Gesucht wird nur die vollständige Fußzeile,
 * damit der Name an anderen Stellen (etwa auf einer Vorstellungsfolie) bleibt.
 */
export function fussNameErsetzen(html: string, von: string, nach: string): string {
  if (!von || !nach || von === nach) return html
  return html.split(FUSS_PRAEFIX + escapeHtml(von)).join(FUSS_PRAEFIX + escapeHtml(nach))
}

/**
 * Setzt eine unsichtbare Markierung: einen HTML-Kommentar ganz oben und ein
 * meta-Tag im Kopf. Beides sieht man im Deck nicht, aber im Quelltext; so lässt
 * sich eine weitergegebene Kopie zuordnen.
 */
export function markieren(html: string, text: string): string {
  // "--" beendet einen HTML-Kommentar vorzeitig
  const kommentar = `<!-- ifmera-kopie: ${text.replace(/-{2,}/g, '–')} -->\n`
  const meta = `<meta name="ifmera-kopie" content="${escapeHtml(text)}">`

  let neu = html
  const kopf = neu.search(/<head[^>]*>/i)
  if (kopf !== -1) {
    const ende = neu.indexOf('>', kopf) + 1
    neu = neu.slice(0, ende) + meta + neu.slice(ende)
  }
  const doctype = neu.match(/^\s*<!doctype[^>]*>\s*/i)
  return doctype
    ? doctype[0] + kommentar + neu.slice(doctype[0].length)
    : kommentar + neu
}

export function deckAnpassen(html: string, a: DeckAnpassung = {}): string {
  let neu = html
  if (a.fussName) neu = fussNameErsetzen(neu, a.fussName.von, a.fussName.nach)
  if (a.markierung) neu = markieren(neu, a.markierung)
  return neu
}
