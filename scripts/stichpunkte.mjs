/**
 * Stichpunkt-Fassung eines Decks (SPEC.md, Baustein 7).
 *
 * Für Trainer mit der Freigabe "nur Stichpunkte" gibt es zu jedem Kurstag eine zweite Trainerfassung und
 * ein zweites Quellpaket. Darin sind die Trainer-Notizen (data-notes) jeder Folie durch Stichpunkte
 * ersetzt; alles andere bleibt Byte für Byte gleich, auch Aktionen (data-aktion) und Brücken (data-bruecke,
 * data-bruecke-kann), Nikos Entscheidungen 15.11.2026.
 *
 * Die Stichpunkte liegen je Deck als JSON im Kursordner (nicht im öffentlichen Repo):
 *   { deck, folien: [{ nr, titel, notiz_sha256, stichpunkte: ["…"] }] }
 * Eine Folie bekommt ihre Stichpunkte nur, wenn Titel und Prüfsumme ihrer Original-Notiz passen. Hat
 * sich die Notiz seitdem geändert (oder ist die Folie neu), steht dort "Stichpunkte folgen." – nie die
 * volle Notiz. Der Sync meldet solche Folien.
 *
 * Vor jedem Hochladen prüft leckPruefen(), dass kein Satz der Original-Notizen in der kurzen Fassung
 * steht (außer er steht ohnehin sichtbar auf einer Folie, in einer Aktion oder einer Brücke).
 */
import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'

export const PLATZHALTER = 'Stichpunkte folgen.'
export const HINWEIS_PAKET =
  '> **Hinweis:** In diesem Quellpaket stehen in den Trainer-Notizen (`data-notes`) nur Stichpunkte, ' +
  'nicht die ausführlichen Notizen des Kursautors. Neue oder geänderte Notizen bitte ebenfalls als ' +
  'Stichpunkte schreiben (je Zeile einer, mit „• “ vorn).\n\n'

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/** Stichpunkte als Notiztext: je Zeile ein „• …“ (das Cockpit zeigt die Zeilen untereinander). */
export function stichpunkteText(liste) {
  return liste.map((s) => `• ${String(s).trim()}`).join('\n')
}

function attributWert(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;')
}

function titelVon(folie) {
  const t =
    folie.querySelector('.folientitel') ?? folie.querySelector('h1') ?? folie.querySelector('.panel-dark h2') ?? folie.querySelector('h2')
  return (t?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Alle Folien eines Decks oder einer Folienquelle, mit Titel, Notiz und Lage des data-notes-Attributs. */
export function folienLesen(html) {
  const dom = new JSDOM(html, { includeNodeLocations: true })
  return Array.from(dom.window.document.querySelectorAll('.slide')).map((folie) => {
    const ort = dom.nodeLocation(folie)?.attrs?.['data-notes']
    return {
      titel: titelVon(folie),
      notiz: folie.getAttribute('data-notes'),
      start: ort?.startOffset ?? null,
      ende: ort?.endOffset ?? null,
    }
  })
}

/** Nachschlagen der Stichpunkte: Titel + Prüfsumme der Original-Notiz → Text. */
function verzeichnis(stichpunkte) {
  const karte = new Map()
  for (const f of stichpunkte?.folien ?? []) {
    karte.set(`${f.titel}\u0000${f.notiz_sha256}`, stichpunkteText(f.stichpunkte ?? []))
  }
  return karte
}

/**
 * Ersetzt in einem HTML-Text alle data-notes der Folien. Gibt den neuen Text und die Folien zurück,
 * für die es keine passenden Stichpunkte gab (dort steht der Platzhalter).
 */
export function notizenErsetzen(html, stichpunkte) {
  const karte = verzeichnis(stichpunkte)
  const folien = folienLesen(html)
  const ersetzungen = []
  const ohne = []
  // Jede data-notes-Angabe im Text muss eine Folie sein, deren Notiz wir ersetzen. Steht eine woanders
  // (auskommentierte Folie, anderes Element, doppelt), lieber abbrechen als sie durchrutschen lassen.
  const roh = (html.match(/data-notes\s*=/gi) ?? []).length
  const gefunden = folien.filter((f) => f.start !== null).length
  if (roh !== gefunden) {
    throw new Error(`${roh} data-notes im Text, aber ${gefunden} an Folien: Notiz ausserhalb einer Folie (Kommentar?)`)
  }
  folien.forEach((f, i) => {
    if (f.notiz !== null && f.notiz.trim() && f.start === null) throw new Error(`Folie ${i + 1}: Notiz ohne Lage im Text`)
    if (f.start === null || f.notiz === null) return // keine Notiz an dieser Folie
    let neu = karte.get(`${f.titel}\u0000${sha256(f.notiz)}`)
    if (neu === undefined) {
      if (!f.notiz.trim()) return // leere Notiz: nichts zu verbergen
      neu = PLATZHALTER
      ohne.push({ nr: i + 1, titel: f.titel })
    }
    ersetzungen.push({ start: f.start, ende: f.ende, text: `data-notes="${attributWert(neu)}"` })
  })
  let ergebnis = html
  for (const e of ersetzungen.sort((a, b) => b.start - a.start)) {
    ergebnis = ergebnis.slice(0, e.start) + e.text + ergebnis.slice(e.ende)
  }
  return { html: ergebnis, folien: folien.length, ersetzt: ersetzungen.length, ohne }
}

/** Das Cockpit soll die Stichpunkte untereinander zeigen: im Engine-Stil „.notes{“ Zeilen beibehalten. */
export function cockpitZeilen(html) {
  const stelle = '.notes{'
  const anzahl = html.split(stelle).length - 1
  if (anzahl !== 1) throw new Error(`Cockpit-Stil ".notes{" ${anzahl}-mal gefunden statt einmal`)
  return html.replace(stelle, '.notes{white-space:pre-line;')
}

/** Stichpunkt-Fassung eines gebauten Trainer-Decks. */
export function kurzDeck(html, stichpunkte) {
  const r = notizenErsetzen(html, stichpunkte)
  return { ...r, html: cockpitZeilen(r.html) }
}

/**
 * Stichpunkt-Fassung eines Quellpakets (Plan aus quellpaket.mjs): Folienquellen und Engine
 * überschrieben, Hinweis vorn in der Anleitung. Die Prüfsumme hängt zusätzlich an den Stichpunkten.
 */
export function kurzQuellpaket(plan, stichpunkte, lesen) {
  const ueberschrieben = {}
  const ohne = []
  let folien = 0
  for (const d of plan.dateien) {
    if (d.ziel.startsWith('slides/')) {
      const r = notizenErsetzen(lesen(d.quelle).toString('utf8'), stichpunkte)
      folien += r.folien
      ohne.push(...r.ohne)
      ueberschrieben[d.ziel] = r.html
    } else if (d.ziel === 'engine/deck_engine.html') {
      ueberschrieben[d.ziel] = cockpitZeilen(lesen(d.quelle).toString('utf8'))
    }
  }
  const anleitung = plan.texte['CLAUDE.md'] ?? ''
  const zeilen = anleitung.split('\n')
  // Hinweis nach der Überschrift einfügen
  const texte = { ...plan.texte, 'CLAUDE.md': [zeilen[0], '', HINWEIS_PAKET.trimEnd(), ...zeilen.slice(1)].join('\n') }
  // version 2: strengere Pruefungen (15.11.2026); erzwingt einmal neue Pakete
  const pruefsumme = sha256(JSON.stringify({ basis: plan.pruefsumme, stichpunkte: sha256(JSON.stringify(stichpunkte)), version: 2 }))
  return { plan: { ...plan, texte, ueberschrieben, pruefsumme }, folien, ohne }
}

/**
 * Alles Lesbare eines HTML: sichtbarer Text, alle Attributwerte, Kommentare und Vorlagen (template),
 * dazu der rohe Text und eine einfach entschlüsselte Fassung davon. So fällt eine Notiz auch auf, wenn
 * sie in einem Kommentar oder anders verschlüsselt im Quelltext steht.
 */
function allesLesbare(html) {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const teile = [doc.documentElement.textContent ?? '']
  for (const el of doc.querySelectorAll('*')) for (const a of Array.from(el.attributes)) teile.push(a.value)
  for (const t of doc.querySelectorAll('template')) teile.push(t.innerHTML)
  const iter = doc.createNodeIterator(doc, dom.window.NodeFilter.SHOW_COMMENT)
  for (let k = iter.nextNode(); k; k = iter.nextNode()) teile.push(k.nodeValue ?? '')
  teile.push(html, entschluesseln(html))
  return teile.join(' ').replace(/\s+/g, ' ')
}

function entschluesseln(text) {
  return text
    .replace(/&#10;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Was ohnehin zur Folie gehört: ihr Text (ohne Skripte und Stile) und die Werte ihrer Attribute, etwa
 * aufklappbare Quiz-Antworten (data-a), außer den Notizen; dazu Aktionen und Brücken, die vollständig
 * bleiben. Was außerhalb der Folien steht (Engine, Skripte), zählt nicht als sichtbar.
 */
function sichtbarerText(html) {
  const doc = new JSDOM(html).window.document
  const teile = []
  for (const folie of doc.querySelectorAll('.slide')) {
    const kopie = folie.cloneNode(true)
    kopie.querySelectorAll('script,style,template').forEach((x) => x.remove())
    teile.push(kopie.textContent ?? '')
    for (const el of [kopie, ...kopie.querySelectorAll('*')]) {
      for (const a of Array.from(el.attributes)) if (a.name !== 'data-notes') teile.push(a.value)
    }
  }
  for (const name of ['data-aktion', 'data-bruecke', 'data-bruecke-kann']) {
    for (const el of doc.querySelectorAll(`[${name}]`)) teile.push(el.getAttribute(name) ?? '')
  }
  return teile.join(' ').replace(/\s+/g, ' ')
}

function saetze(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 50)
}

/**
 * Prüft, dass kein Satz der Original-Notizen (ab 50 Zeichen) in den kurzen Fassungen steht, auch nicht in
 * Kommentaren oder verschlüsselt. Sätze, die ohnehin auf einer Folie oder in einer Aktion stehen, zählen
 * nicht. `weitereNotizen`: Notizen aus den Folienquellen (falls dort mehr steht als im Deck).
 * `kurz` ist eine Liste von { name, inhalt }. Rückgabe: gefundene Sätze.
 */
export function leckPruefen(originalHtml, kurz, weitereNotizen = []) {
  const notizen = [...folienLesen(originalHtml).map((f) => f.notiz ?? ''), ...weitereNotizen]
  const sichtbar = sichtbarerText(originalHtml)
  const geheim = [...new Set(notizen.flatMap((n) => saetze(n)))].filter((s) => !sichtbar.includes(s))
  const funde = []
  for (const k of kurz) {
    const text = /\.html?$/i.test(k.name) ? allesLesbare(k.inhalt) : `${k.inhalt} ${entschluesseln(k.inhalt)}`.replace(/\s+/g, ' ')
    for (const s of geheim) if (text.includes(s)) funde.push({ datei: k.name, satz: s.slice(0, 60) })
  }
  return funde
}
