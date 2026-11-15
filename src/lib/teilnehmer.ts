/**
 * Teilnehmerfassung eines gebauten Decks, im Browser erzeugt (SPEC.md, Baustein 9).
 *
 * Genau wie Nikos engine/teilnehmer.py: Entfernt werden die Trainertexte (data-notes, data-aktion,
 * data-bruecke, data-bruecke-kann) und die Knöpfe „Trainer-Cockpit öffnen“ und „Lesemodus“; vor dem
 * letzten </body> kommt die Wisch- und Klicknavigation. Die Zeilenenden folgen der Vorlage (Python unter
 * Windows schreibt CRLF). Ein Test vergleicht das Ergebnis Byte für Byte mit Nikos fertigen
 * Teilnehmerfassungen (src/lib/teilnehmer.engine.test.ts).
 */

const NOTIZ_ATTRIBUTE = /\s+data-(?:notes|aktion|bruecke(?:-kann)?)\s*=\s*"[^"]*"/g
const NOTIZ_ATTRIBUTE_EINFACH = /\s+data-(?:notes|aktion|bruecke(?:-kann)?)\s*=\s*'[^']*'/g
const KNOPF_COCKPIT = /\s*<button onclick="openCockpit\(\)">[\s\S]*?<\/button>/g
const KNOPF_LESEN = /\s*<button onclick="toggleLesen\(\)">[\s\S]*?<\/button>/g

/** Wisch- und Klicknavigation für Telefon und Tablet (aus teilnehmer.py übernommen). */
const NAVIGATION = "\n<style>\n  #tnav{position:fixed;inset:0;pointer-events:none;z-index:40}\n  #tnav button{position:absolute;top:50%;transform:translateY(-50%);\n    pointer-events:auto;width:44px;height:64px;border:0;border-radius:8px;\n    background:rgba(0,68,74,.28);color:#FAF5EB;font-size:26px;line-height:1;\n    cursor:pointer;opacity:.35;transition:opacity .15s}\n  #tnav button:hover{opacity:.9}\n  #tnav .tprev{left:10px} #tnav .tnext{right:10px}\n  body.lesen #tnav{display:none}\n  @media print{#tnav{display:none}}\n</style>\n<div id=\"tnav\" aria-hidden=\"true\">\n  <button class=\"tprev\" onclick=\"go(-1)\" title=\"Zurück\">‹</button>\n  <button class=\"tnext\" onclick=\"go(1)\" title=\"Weiter\">›</button>\n</div>\n<script>\n(function(){\n  var x0=null, y0=null, t0=0;\n  function ziehbar(el){ return !!(el && el.closest && el.closest('.docviewport')); }\n  document.addEventListener('touchstart', function(e){\n    if(e.touches.length!==1 || ziehbar(e.target)){x0=null;return}\n    x0=e.touches[0].clientX; y0=e.touches[0].clientY; t0=Date.now();\n  }, {passive:true});\n  document.addEventListener('touchend', function(e){\n    if(x0===null) return;\n    var t=e.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0;\n    x0=null;\n    // Waagerecht, weit genug, schnell genug — sonst war es Scrollen.\n    if(Math.abs(dx)<50 || Math.abs(dx)<Math.abs(dy)*1.5 || Date.now()-t0>700) return;\n    go(dx<0 ? 1 : -1);\n  }, {passive:true});\n})();\n</script>\n"

export interface TeilnehmerBericht {
  notizen: number
  cockpit: number
  lesen: number
  navigation: number
  /** Was nicht mehr drinstehen darf, aber noch drinsteht; leer heißt in Ordnung */
  offen: string[]
}

function zaehlenUndErsetzen(text: string, muster: RegExp): [string, number] {
  let n = 0
  const neu = text.replace(muster, () => {
    n++
    return ''
  })
  return [neu, n]
}

/** Baut die Teilnehmerfassung. Wirft nicht; was übrig bleibt, steht in `offen`. */
export function teilnehmerFassung(roh: string): { html: string; bericht: TeilnehmerBericht } {
  // Wie Python beim Lesen: Zeilenenden vereinheitlichen; beim Schreiben wieder wie die Vorlage
  const crlf = roh.includes('\r\n')
  let text = roh.replace(/\r\n?/g, '\n')
  let n1: number, n2: number, cockpit: number, lesen: number
  ;[text, n1] = zaehlenUndErsetzen(text, NOTIZ_ATTRIBUTE)
  ;[text, n2] = zaehlenUndErsetzen(text, NOTIZ_ATTRIBUTE_EINFACH)
  ;[text, cockpit] = zaehlenUndErsetzen(text, KNOPF_COCKPIT)
  ;[text, lesen] = zaehlenUndErsetzen(text, KNOPF_LESEN)
  // Das LETZTE </body>: das Cockpit trägt als Textbaustein ein eigenes, früheres
  const stelle = text.lastIndexOf('</body>')
  let navigation = 0
  if (stelle >= 0) {
    text = text.slice(0, stelle) + NAVIGATION + '\n' + text.slice(stelle)
    navigation = 1
  }
  const offen: string[] = []
  for (const [wort, name] of [
    ['data-notes', 'Trainernotiz'],
    ['data-aktion', 'Trainer-Aktion'],
    ['data-bruecke', 'Trainer-Brücke'],
  ] as const) {
    const n = text.split(wort).length - 1
    if (n) offen.push(`${name}: ${n} Vorkommen`)
  }
  const knopf = (text.match(/<button onclick="openCockpit\(\)"/g) ?? []).length
  if (knopf) offen.push(`Cockpit-Knopf: ${knopf} Vorkommen`)
  if (!text.includes('touchend')) offen.push('Wischnavigation fehlt')
  return {
    html: crlf ? text.replace(/\n/g, '\r\n') : text,
    bericht: { notizen: n1 + n2, cockpit, lesen, navigation, offen },
  }
}
