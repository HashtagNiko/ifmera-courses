import { escapeHtml } from './deckAnpassung'

/**
 * Folien eines Decks und eigene Notizen dazu (SPEC.md, Baustein 3).
 *
 * Reine Funktionen ohne Supabase, damit sie sich ohne Netz testen lassen
 * (src/lib/folien.test.ts). Die Decks bleiben unverändert; eigene Notizen kommen
 * nur in die Kopie im Browser.
 */

export interface Folie {
  /** Position im Deck, 0-basiert, in derselben Reihenfolge wie allSlides der Engine */
  index: number
  /** Schlüssel, unter dem eine eigene Notiz gespeichert wird */
  schluessel: string
  titel: string
  /** Original aus dem Deck (data-notes, data-aktion) */
  notiz: string
  aktion: string
  kann: boolean
}

/** Titel einer Folie, wie ihn die Engine im Cockpit zeigt (titleOf in deck_engine.html). */
function folienTitel(folie: Element): string {
  const element =
    folie.querySelector('.folientitel') ?? folie.querySelector('h1') ?? folie.querySelector('.panel-dark h2')
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim() || 'Folie'
}

/**
 * Liest die Folien eines Decks. Der Schlüssel ist das data-id der Folie, falls es
 * eines gibt; sonst der Titel mit laufender Nummer bei gleichen Titeln
 * ("t:willkommen zurück#1"). Damit verrutscht keine Notiz, wenn Niko eine Folie
 * einfügt; ändert er einen Titel, findet die Notiz ihre Folie nicht mehr und
 * erscheint unter "ohne Folie".
 */
export function folienLesen(html: string): Folie[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const buehne = doc.getElementById('stage') ?? doc
  const zaehler = new Map<string, number>()
  return Array.from(buehne.querySelectorAll('.slide')).map((folie, index) => {
    const titel = folienTitel(folie)
    const id = folie.getAttribute('data-id')
    // Folien ohne Titel (in 11 von 44 Decks gibt es eine) werden an ihrem Text erkannt; sonst
    // hiessen alle "Folie" und eine eingefuegte Folie ohne Titel schoebe Notizen auf die falsche.
    const grund = id
      ? `id:${id.slice(0, 250)}`
      : titel !== 'Folie'
        ? `t:${titel.toLowerCase().slice(0, 250)}`
        : `x:${(folie.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80)}`
    // laufende Nummer bei gleichen Titeln (und doppelten data-id)
    const nummer = (zaehler.get(grund) ?? 0) + 1
    zaehler.set(grund, nummer)
    const schluessel = `${grund}#${nummer}`
    return {
      index,
      schluessel,
      titel,
      notiz: folie.getAttribute('data-notes') ?? '',
      aktion: folie.getAttribute('data-aktion') ?? '',
      kann: folie.getAttribute('data-track') === 'kann',
    }
  })
}

/**
 * Mini-Formatierung für eigene Notizen: **fett**, *kursiv*, Aufzählung mit "- "
 * am Zeilenanfang, Zeilenumbruch. Erst wird alles maskiert, dann werden nur diese
 * vier Formen in HTML verwandelt; anderes HTML kann so nicht hineingeraten.
 */
export function notizHtml(text: string): string {
  const zeilen = escapeHtml(text).split(/\r?\n/)
  const teile: string[] = []
  let liste: string[] | null = null
  for (const zeile of zeilen) {
    const punkt = zeile.match(/^\s*[-•]\s+(.*)$/)
    if (punkt) {
      liste ??= []
      liste.push(`<li>${inline(punkt[1])}</li>`)
      continue
    }
    if (liste) {
      teile.push(`<ul style="margin:4px 0 4px 18px;padding:0">${liste.join('')}</ul>`)
      liste = null
    }
    teile.push(`${inline(zeile)}<br>`)
  }
  if (liste) teile.push(`<ul style="margin:4px 0 4px 18px;padding:0">${liste.join('')}</ul>`)
  return teile.join('').replace(/(<br>)+$/, '')
}

function inline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
}

export interface EigeneNotiz {
  folie_schluessel: string
  notiz: string
  aktion: string
}

/**
 * Setzt eigene Notizen in die Kopie eines Decks ein. Das Cockpit zeigt dann zu
 * jeder Folie mit eigener Notiz diese statt des Originals; ein Schalter im Cockpit
 * holt das Original zurück. Ohne eigene Notizen bleibt das Deck unverändert.
 *
 * Umgesetzt als kleines Skript am Ende des Decks, das syncCockpit() der Engine
 * umhüllt: erst zeichnet die Engine wie immer, dann ersetzt das Skript Notiz und
 * Aktion. Die Engine selbst wird nicht verändert. Geht etwas schief, bleibt es
 * beim Original.
 */
export function notizenEinsetzen(html: string, notizen: EigeneNotiz[]): string {
  const nachSchluessel = new Map(notizen.map((n) => [n.folie_schluessel, n]))
  const eintraege = folienLesen(html).map((folie) => {
    const n = nachSchluessel.get(folie.schluessel)
    if (!n || (!n.notiz.trim() && !n.aktion.trim())) return null
    return {
      notiz: n.notiz.trim() ? notizHtml(n.notiz) : '',
      aktion: n.aktion.trim() ? notizHtml(n.aktion) : '',
    }
  })
  if (eintraege.every((e) => e === null)) return html

  // "<" maskieren, damit ein "</script>" in einer Notiz das Skript nicht beendet
  const daten = JSON.stringify(eintraege).replace(/</g, '\\u003c')
  // Ersatz als Funktion: sonst würde ein "$&" in einer Notiz als Sonderzeichen gelesen
  const skript = `<script>${OVERLAY.replace('__EIGEN__', () => daten)}</script>`
  const stelle = html.lastIndexOf('</body>')
  return stelle === -1 ? html + skript : html.slice(0, stelle) + skript + html.slice(stelle)
}

/**
 * Das Skript im Deck. Es nutzt die Namen der Engine (allSlides, activeSlides, cur,
 * cockpit, syncCockpit); die gibt es in beiden Engines (WEG und H&G) gleich.
 */
export const OVERLAY = `
(function () {
  var EIGEN = __EIGEN__;
  if (typeof window.syncCockpit !== 'function') return;
  var original = window.syncCockpit;
  var zeigeOriginal = false;
  window.syncCockpit = function () {
    // Die Engine bricht in syncCockpit ab, wenn es im Deck keine Uhr #tmr gibt (in den gebauten
    // Decks fehlt sie, Stand 13.11.2026). Der Fehler wird gemerkt, die eigene Notiz trotzdem
    // eingesetzt und der Fehler danach unveraendert weitergegeben: Die Engine verhaelt sich so
    // wie ohne dieses Skript.
    var engineFehler = null;
    try {
      original.apply(this, arguments);
    } catch (e) {
      engineFehler = e;
    }
    einsetzen();
    if (engineFehler) throw engineFehler;
  };
  function einsetzen() {
    try {
      if (!cockpit || cockpit.closed) return;
      var d = cockpit.document;
      var notes = d.getElementById('notes');
      var aktion = d.getElementById('aktion');
      if (!notes) return;
      var schalter = d.getElementById('ifmEigen');
      if (!schalter) {
        schalter = d.createElement('label');
        schalter.id = 'ifmEigen';
        schalter.style.cssText = 'display:block;margin:6px 0;font-size:12px;opacity:.8;cursor:pointer';
        schalter.innerHTML = '<input type="checkbox" id="ifmOriginal" style="vertical-align:middle"> Original-Notizen zeigen (statt meiner eigenen)';
        notes.parentNode.insertBefore(schalter, notes);
        var kasten = d.getElementById('ifmOriginal');
        // Cockpit neu geoeffnet: der Schalter zeigt den Zustand von vorher
        kasten.checked = zeigeOriginal;
        kasten.addEventListener('change', function (e) {
          zeigeOriginal = e.target.checked;
          try {
            window.syncCockpit();
          } catch (fehler) {
            /* bekannter Fehler der Engine (fehlende Uhr #tmr), die Notiz ist trotzdem gesetzt */
          }
        });
      }
      var folien = typeof allSlides !== 'undefined' ? allSlides : Array.prototype.slice.call(document.querySelectorAll('.slide'));
      var eintrag = EIGEN[folien.indexOf(activeSlides()[cur])];
      schalter.style.display = eintrag ? 'block' : 'none';
      if (!eintrag || zeigeOriginal) return;
      if (eintrag.notiz) notes.innerHTML = eintrag.notiz;
      if (eintrag.aktion && aktion) aktion.innerHTML = eintrag.aktion;
    } catch (fehler) {
      /* dann bleibt es beim Original */
    }
  }
})();
`
