// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { folienLesen, notizenEinsetzen, notizHtml } from './folien'

const folie = (titel: string, extra = '') =>
  `<section class="slide" ${extra}><h2 class="folientitel">${titel}</h2><div class="foot"></div></section>`

const DECK = `<!DOCTYPE html><html><head></head><body><div id="stage">
<section class="slide" data-topic="Rahmen" data-notes="Begrüßung" data-aktion="Runde"><div class="panel-dark"><h1>Tag 3</h1></div></section>
${folie('Die Versammlung', 'data-notes="N2"')}
${folie('Prüfungsfragen', 'data-track="kann"')}
${folie('Prüfungsfragen')}
${folie('Mit Kennung', 'data-id="f-7k2m"')}
</div><script>/* Engine */</script></body></html>`

describe('folienLesen', () => {
  const folien = folienLesen(DECK)

  it('findet alle Folien in Reihenfolge, mit Titel und Original-Notizen', () => {
    expect(folien.map((f) => f.titel)).toEqual(['Tag 3', 'Die Versammlung', 'Prüfungsfragen', 'Prüfungsfragen', 'Mit Kennung'])
    expect(folien[0]).toMatchObject({ index: 0, notiz: 'Begrüßung', aktion: 'Runde', kann: false })
    expect(folien[2].kann).toBe(true)
  })

  it('zählt gleiche Titel durch und nimmt data-id, wenn vorhanden', () => {
    expect(folien.map((f) => f.schluessel)).toEqual([
      't:tag 3#1',
      't:die versammlung#1',
      't:prüfungsfragen#1',
      't:prüfungsfragen#2',
      'id:f-7k2m#1',
    ])
  })

  it('erkennt Folien ohne Titel an ihrem Text und nummeriert doppelte data-id', () => {
    const deck = `<div id="stage">
      <section class="slide"><p>Bild   ohne Titel</p></section>
      <section class="slide"><p>Anderes Bild</p></section>
      <section class="slide" data-id="x"></section><section class="slide" data-id="x"></section></div>`
    expect(folienLesen(deck).map((f) => [f.titel, f.schluessel])).toEqual([
      ['Folie', 'x:bild ohne titel#1'],
      ['Folie', 'x:anderes bild#1'],
      ['Folie', 'id:x#1'],
      ['Folie', 'id:x#2'],
    ])
  })

  it('behält die Schlüssel, wenn vorne eine Folie eingefügt wird', () => {
    const neu = DECK.replace('<div id="stage">', `<div id="stage">${folie('Neue Folie')}`)
    const vorher = new Map(folien.map((f) => [f.titel + f.index, f.schluessel]))
    const nachher = folienLesen(neu)
    expect(nachher).toHaveLength(6)
    expect(nachher[2].schluessel).toBe(vorher.get('Die Versammlung1'))
    expect(nachher[4].schluessel).toBe('t:prüfungsfragen#2')
  })
})

describe('notizHtml', () => {
  it('setzt fett, kursiv, Aufzählung und Zeilenumbruch um', () => {
    expect(notizHtml('**Wichtig** und *leise*\nZeile 2')).toBe('<b>Wichtig</b> und <i>leise</i><br>Zeile 2')
    expect(notizHtml('Punkte:\n- eins\n- zwei\nDanach')).toBe(
      'Punkte:<br><ul style="margin:4px 0 4px 18px;padding:0"><li>eins</li><li>zwei</li></ul>Danach',
    )
  })

  it('lässt kein HTML durch', () => {
    const html = notizHtml('<img src=x onerror=alert(1)> **<b>x</b>**')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('<b>&lt;b&gt;x&lt;/b&gt;</b>')
  })
})

describe('notizenEinsetzen', () => {
  it('lässt das Deck ohne eigene Notizen unverändert', () => {
    expect(notizenEinsetzen(DECK, [])).toBe(DECK)
    expect(notizenEinsetzen(DECK, [{ folie_schluessel: 't:tag 3#1', notiz: '  ', aktion: '' }])).toBe(DECK)
  })

  it('setzt das Skript vor </body>; die Daten enthalten kein "<" (kein vorzeitiges </script>)', () => {
    // **fett** erzeugt <b>…</b>; im eingebetteten JSON muss jedes "<" maskiert sein
    const neu = notizenEinsetzen(DECK, [{ folie_schluessel: 't:die versammlung#1', notiz: '**a** </script>', aktion: '' }])
    const skript = neu.slice(neu.lastIndexOf('<script>') + 8, neu.lastIndexOf('</script>'))
    const daten = skript.slice(skript.indexOf('var EIGEN = ') + 12, skript.indexOf(';\n  if (typeof'))
    expect(daten).not.toContain('<')
    expect(daten).toContain('\\u003cb>a\\u003c/b>')
    expect(JSON.parse(daten)[1].notiz).toBe('<b>a</b> &lt;/script&gt;')
    expect(neu.endsWith('</script></body></html>')).toBe(true)
  })

  it('nimmt "$&" in einer Notiz wörtlich', () => {
    const neu = notizenEinsetzen(DECK, [{ folie_schluessel: 't:die versammlung#1', notiz: '$& kosten', aktion: '' }])
    expect(neu).toContain('$&amp; kosten')
    expect(neu).not.toContain('__EIGEN__')
  })
})

/**
 * Das Skript im Cockpit: nachgestellt mit den Namen der Engine (allSlides,
 * activeSlides, cur, cockpit, syncCockpit), damit sich ohne Browser prüfen lässt,
 * ob es die eigene Notiz einsetzt und der Schalter das Original zurückholt.
 */
describe('Cockpit mit eigenen Notizen', () => {
  const g = globalThis as Record<string, unknown>
  afterEach(() => {
    for (const k of ['allSlides', 'activeSlides', 'cur', 'cockpit']) delete g[k]
  })

  function cockpitAufbauen(notizen: Parameters<typeof notizenEinsetzen>[1]) {
    document.body.innerHTML = DECK.slice(DECK.indexOf('<div id="stage">'), DECK.indexOf('<script>'))
    const folien = Array.from(document.querySelectorAll('.slide'))
    const cockpitDoc = document.implementation.createHTMLDocument('Cockpit')
    cockpitDoc.body.innerHTML = '<div class="aktion" id="aktion">–</div><div class="notes" id="notes">–</div>'

    // Engine-Ersatz: zeichnet wie das Original per textContent
    g.allSlides = folien
    g.activeSlides = () => folien
    g.cur = 0
    g.cockpit = { closed: false, document: cockpitDoc }
    const fenster = window as unknown as Record<string, unknown>
    fenster.syncCockpit = () => {
      const s = folien[g.cur as number]
      cockpitDoc.getElementById('notes')!.textContent = s.getAttribute('data-notes') || '—'
      cockpitDoc.getElementById('aktion')!.textContent = s.getAttribute('data-aktion') || '—'
    }

    const neu = notizenEinsetzen(DECK, notizen)
    const code = neu.slice(neu.lastIndexOf('<script>') + 8, neu.lastIndexOf('</script>'))
    // wie im Browser: das Skript läuft nach der Engine im selben globalen Bereich
    new Function(code)()
    return { cockpitDoc, sync: () => (fenster.syncCockpit as () => void)() }
  }

  it('zeigt die eigene Notiz statt des Originals, formatiert', () => {
    const { cockpitDoc, sync } = cockpitAufbauen([
      { folie_schluessel: 't:tag 3#1', notiz: '**Meine** Begrüßung', aktion: 'Meine Runde' },
    ])
    sync()
    expect(cockpitDoc.getElementById('notes')!.innerHTML).toBe('<b>Meine</b> Begrüßung')
    expect(cockpitDoc.getElementById('aktion')!.innerHTML).toBe('Meine Runde')
  })

  it('lässt Folien ohne eigene Notiz beim Original und blendet den Schalter aus', () => {
    const { cockpitDoc, sync } = cockpitAufbauen([{ folie_schluessel: 't:tag 3#1', notiz: 'Eigen', aktion: '' }])
    g.cur = 1
    sync()
    expect(cockpitDoc.getElementById('notes')!.textContent).toBe('N2')
    expect((cockpitDoc.getElementById('ifmEigen') as HTMLElement).style.display).toBe('none')
  })

  it('holt mit dem Schalter das Original zurück', () => {
    const { cockpitDoc, sync } = cockpitAufbauen([{ folie_schluessel: 't:tag 3#1', notiz: 'Eigen', aktion: '' }])
    sync()
    expect(cockpitDoc.getElementById('notes')!.textContent).toBe('Eigen')
    const schalter = cockpitDoc.getElementById('ifmOriginal') as HTMLInputElement
    schalter.checked = true
    schalter.dispatchEvent(new Event('change'))
    expect(cockpitDoc.getElementById('notes')!.textContent).toBe('Begrüßung')
  })

  it('bleibt beim Original, wenn ein Engine-Name fehlt', () => {
    const { cockpitDoc, sync } = cockpitAufbauen([{ folie_schluessel: 't:tag 3#1', notiz: 'Eigen', aktion: '' }])
    delete g.activeSlides
    expect(() => sync()).not.toThrow()
    expect(cockpitDoc.getElementById('notes')!.textContent).toBe('Begrüßung')
  })
})
