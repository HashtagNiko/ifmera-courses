// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import JSZip from 'jszip'
import { quellpaketZippen } from './quellpaket.mjs'
import { PLATZHALTER, cockpitZeilen, folienLesen, kurzDeck, kurzQuellpaket, leckPruefen, notizenErsetzen, stichpunkteText } from './stichpunkte.mjs'

const sha = (s) => createHash('sha256').update(s).digest('hex')

const N1 = 'Der Wochenmarkt beginnt um acht Uhr und endet am frühen Nachmittag mit dem Abbau. Wer frisches Gemüse sucht, kommt am besten vor zehn Uhr, dann ist die Auswahl am größten.'
const N2 = 'Hier steht eine "zitierte" Aussage & ein Zeichen > das escaped werden muss, und noch ein langer Satz dazu.'
const N3 = 'Diese Notiz gehört zu einer neuen Folie, für die es noch keine Stichpunkte gibt, und darf nie durchrutschen.'
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/>/g, '&gt;')

const folien = `<section class="slide" data-notes="${esc(N1)}" data-aktion="Beispiele sammeln"><h2 class="folientitel">Wochenmarkt</h2><p>Folientext</p></section>
<section class="slide kann" data-aktion="Frage" data-notes="${esc(N2)}"><h2 class="folientitel">Zweite Folie</h2></section>
<section class="slide" data-notes="${esc(N3)}"><h2 class="folientitel">Neu</h2></section>`
const engine = `<!doctype html><html><head><style>.slide{}</style><script>const css='.notes{background:red}';</script></head><body><div id="stage">__SLIDES__</div></body></html>`
const deck = engine.replace('__SLIDES__', folien)

const stichpunkte = {
  deck: 'Tag1_Segment1.html',
  folien: [
    { nr: 1, titel: 'Wochenmarkt', notiz_sha256: sha(N1), stichpunkte: ['Markt 8 Uhr bis Nachmittag', 'Gemüse: vor 10 Uhr kommen'] },
    { nr: 2, titel: 'Zweite Folie', notiz_sha256: sha(N2), stichpunkte: ['Zitat & Zeichen „>“'] },
  ],
}

/** Alles außer den data-notes-Attributen muss gleich bleiben. */
function ohneNotizen(html) {
  let s = html
  for (const f of folienLesen(html).filter((f) => f.start !== null).sort((a, b) => b.start - a.start)) {
    s = s.slice(0, f.start) + s.slice(f.ende)
  }
  return s
}

describe('Stichpunkt-Fassung', () => {
  it('ersetzt nur die Notizen, Rest bleibt Byte für Byte', () => {
    const r = notizenErsetzen(deck, stichpunkte)
    expect(r.folien).toBe(3)
    expect(r.ersetzt).toBe(3)
    expect(ohneNotizen(r.html)).toBe(ohneNotizen(deck))
    const neu = folienLesen(r.html)
    expect(neu[0].notiz).toBe(stichpunkteText(stichpunkte.folien[0].stichpunkte))
    expect(neu[1].notiz).toBe('• Zitat & Zeichen „>“')
    // Aktionen bleiben vollständig
    const doc = new JSDOM(r.html).window.document
    expect(doc.querySelectorAll('.slide')[0].getAttribute('data-aktion')).toBe('Beispiele sammeln')
  })

  it('neue oder geänderte Notiz: Platzhalter statt der vollen Notiz, und gemeldet', () => {
    const r = notizenErsetzen(deck, stichpunkte)
    expect(folienLesen(r.html)[2].notiz).toBe(PLATZHALTER)
    expect(r.ohne).toEqual([{ nr: 3, titel: 'Neu' }])
    // geänderte Notiz: gleiche Folie, anderer Text → Platzhalter
    const geaendert = deck.replace('Abbau.', 'Abbau, neu.')
    expect(folienLesen(notizenErsetzen(geaendert, stichpunkte).html)[0].notiz).toBe(PLATZHALTER)
  })

  it('Cockpit zeigt Zeilen untereinander; ohne genau eine Stelle bricht es ab', () => {
    expect(kurzDeck(deck, stichpunkte).html).toContain('.notes{white-space:pre-line;background:red}')
    expect(() => cockpitZeilen('<style></style>')).toThrow(/0-mal/)
    expect(() => cockpitZeilen('.notes{a}.notes{b}')).toThrow(/2-mal/)
  })

  it('Leck-Prüfung findet keine Sätze in der kurzen Fassung, aber jeden absichtlich übrig gelassenen', () => {
    const kurz = kurzDeck(deck, stichpunkte).html
    expect(leckPruefen(deck, [{ name: 'deck.html', inhalt: kurz }])).toEqual([])
    // Gegenprobe: die Original-Notiz steht noch drin
    const funde = leckPruefen(deck, [{ name: 'deck.html', inhalt: deck }, { name: 'x.md', inhalt: N1 }])
    expect(funde.map((f) => f.datei)).toEqual(expect.arrayContaining(['deck.html', 'x.md']))
  })

  it('Satz, der ohnehin sichtbar auf einer Folie steht, gilt nicht als Leck', () => {
    const satz = 'Dieser Satz steht sowohl auf der Folie als auch in der Notiz und ist lang genug.'
    const d = engine.replace('__SLIDES__', `<section class="slide" data-notes="${satz}"><h2 class="folientitel">A</h2><p>${satz}</p></section>`)
    const k = kurzDeck(d, { folien: [] }).html
    expect(leckPruefen(d, [{ name: 'd.html', inhalt: k }])).toEqual([])
  })

  it('Quellpaket: Folienquellen und Engine überschrieben, Hinweis in der Anleitung, Zip ohne Original-Notizen', async () => {
    const dateien = {
      'q/slides/a.html': folien.split('\n')[0],
      'q/slides/b.html': folien.split('\n').slice(1).join('\n'),
      'q/engine.html': engine,
      'q/bild.png': 'PNG',
    }
    const plan = {
      ordnername: 'Tag1_Segment1',
      dateien: [
        { ziel: 'slides/a.html', quelle: 'q/slides/a.html' },
        { ziel: 'slides/b.html', quelle: 'q/slides/b.html' },
        { ziel: 'anlagen/bild.png', quelle: 'q/bild.png' },
        { ziel: 'engine/deck_engine.html', quelle: 'q/engine.html' },
      ],
      texte: { 'CLAUDE.md': '# Titel\n\nText', 'build.json': '{}' },
      pruefsumme: 'abc',
    }
    const lesen = (p) => Buffer.from(dateien[p], 'utf8')
    const r = kurzQuellpaket(plan, stichpunkte, lesen)
    expect(r.folien).toBe(3)
    expect(r.ohne).toEqual([{ nr: 2, titel: 'Neu' }]) // Nummer innerhalb der Datei b.html
    expect(r.plan.pruefsumme).not.toBe('abc')
    expect(r.plan.texte['CLAUDE.md'].split('\n')[0]).toBe('# Titel')
    expect(r.plan.texte['CLAUDE.md']).toContain('nur Stichpunkte')
    expect(r.plan.ueberschrieben['engine/deck_engine.html']).toContain('white-space:pre-line')
    expect(r.plan.ueberschrieben['anlagen/bild.png']).toBeUndefined()

    // Zippen mit Überschreibungen: Bild kommt von der Platte, der Rest aus dem Speicher
    const zipPlan = { ...r.plan, dateien: r.plan.dateien.map((d) => ({ ...d, quelle: d.ziel === 'anlagen/bild.png' ? 'package.json' : 'package.json' })) }
    const zip = await JSZip.loadAsync(await quellpaketZippen(zipPlan))
    const texte = await Promise.all(
      Object.entries(zip.files).filter(([, e]) => !e.dir).map(async ([name, e]) => ({ name, inhalt: await e.async('string') })),
    )
    expect(texte.find((t) => t.name.endsWith('slides/a.html')).inhalt).toContain('Markt 8 Uhr bis Nachmittag')
    expect(leckPruefen(deck, texte)).toEqual([])
  })
})
