import { describe, expect, it } from 'vitest'
import { deckAnpassen, escapeHtml, fussNameErsetzen, markieren } from './deckAnpassung'
import { downloadName, type Kurstag } from './kurse'

// So steht die Fußzeile in den gebauten Decks (geprüft am 13.11.2026)
const FOLIE = `<section class="slide"><h2 class="folientitel">Willkommen</h2>
<p>Ihr Trainer: Herr Krnic</p>
<div class="foot"><span>© ifmera academy GmbH | Herr Krnic</span><span class="pagenum"></span></div></section>`
const DECK = `<!DOCTYPE html>\n<html lang="de"><head><meta charset="utf-8"><title>T</title></head><body>${FOLIE}${FOLIE}</body></html>`

describe('fussNameErsetzen', () => {
  it('ersetzt den Namen in jeder Fußzeile', () => {
    const neu = fussNameErsetzen(DECK, 'Herr Krnic', 'Herr Muster')
    expect(neu.match(/© ifmera academy GmbH \| Herr Muster/g)).toHaveLength(2)
    expect(neu).not.toContain('© ifmera academy GmbH | Herr Krnic')
  })

  it('lässt den Namen außerhalb der Fußzeile stehen', () => {
    expect(fussNameErsetzen(DECK, 'Herr Krnic', 'Herr Muster')).toContain('Ihr Trainer: Herr Krnic')
  })

  it('ändert nichts ohne Namen oder bei gleichem Namen', () => {
    expect(fussNameErsetzen(DECK, '', 'Herr Muster')).toBe(DECK)
    expect(fussNameErsetzen(DECK, 'Herr Krnic', '')).toBe(DECK)
    expect(fussNameErsetzen(DECK, 'Herr Krnic', 'Herr Krnic')).toBe(DECK)
  })

  it('maskiert den neuen Namen, damit er kein HTML einschleust', () => {
    const neu = fussNameErsetzen(DECK, 'Herr Krnic', '<script>x</script>')
    expect(neu).not.toContain('<script>x</script>')
    expect(neu).toContain('&lt;script&gt;x&lt;/script&gt;')
  })
})

describe('markieren', () => {
  const text = 'Herr Muster, heruntergeladen am 13.11.2026, 19:00:00 über courses.shnoozy.top'

  it('setzt Kommentar nach dem Doctype und meta-Tag in den Kopf', () => {
    const neu = markieren(DECK, text)
    expect(neu.startsWith('<!DOCTYPE html>\n<!-- ifmera-kopie: Herr Muster')).toBe(true)
    expect(neu).toContain(`<head><meta name="ifmera-kopie" content="${escapeHtml(text)}">`)
  })

  it('lässt den sichtbaren Inhalt unverändert', () => {
    const neu = markieren(DECK, text)
    expect(neu.slice(neu.indexOf('<body>'))).toBe(DECK.slice(DECK.indexOf('<body>')))
  })

  it('kann den Kommentar nicht vorzeitig beenden und kein Attribut sprengen', () => {
    const neu = markieren(DECK, 'a -- b --> "c"')
    const kommentar = neu.match(/<!-- ifmera-kopie:.*?-->/)![0]
    expect(kommentar).toBe('<!-- ifmera-kopie: a – b –> "c" -->')
    expect(neu).toContain('content="a -- b --&gt; &quot;c&quot;"')
  })

  it('kommt ohne Doctype und ohne head aus', () => {
    expect(markieren('<p>x</p>', 'm')).toBe('<!-- ifmera-kopie: m -->\n<p>x</p>')
  })
})

describe('deckAnpassen', () => {
  it('ohne Anpassung bleibt alles gleich', () => {
    expect(deckAnpassen(DECK)).toBe(DECK)
    expect(deckAnpassen(DECK, {})).toBe(DECK)
  })

  it('kombiniert Name und Markierung', () => {
    const neu = deckAnpassen(DECK, { fussName: { von: 'Herr Krnic', nach: 'Herr Muster' }, markierung: 'm' })
    expect(neu).toContain('© ifmera academy GmbH | Herr Muster')
    expect(neu).toContain('<!-- ifmera-kopie: m -->')
  })
})

describe('downloadName', () => {
  const tag = { nummer: 5, liefername: '2.3 Slides - Rechtliche Grundlagen - Eigentümerversammlung & Beschlüsse' } as Kurstag

  it('nimmt den Liefernamen, die Trainerfassung mit Zusatz', () => {
    expect(downloadName(tag, 'teilnehmer')).toBe(`${tag.liefername}.html`)
    expect(downloadName(tag, 'pdf')).toBe(`${tag.liefername}.pdf`)
    expect(downloadName(tag, 'trainer')).toBe(`${tag.liefername} (Trainerfassung).html`)
  })

  it('fällt ohne Liefernamen auf "Tag <n>" zurück', () => {
    expect(downloadName({ ...tag, liefername: null }, 'pdf')).toBe('Tag 5.pdf')
    expect(downloadName(tag, 'quellen')).toBe(`${tag.liefername} (Quellen).zip`)
  })
})
