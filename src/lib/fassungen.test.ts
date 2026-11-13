import { describe, expect, it } from 'vitest'
import { GRENZE_DECK, GRENZE_ZIP, deckPruefen, pruefsumme, zipPruefen } from './fassungen'

describe('deckPruefen', () => {
  const deck = '<html><body><div id="stage"><section class="slide" data-notes="x"></section></div></body></html>'

  it('nimmt ein gebautes Deck an', () => {
    expect(deckPruefen('Tag5_Segment2.html', 1000, deck)).toBeNull()
    expect(deckPruefen('deck.HTM', 1000, '<section class=slide>')).toBeNull()
  })

  it('lehnt falsche Endung, zu große Dateien und Dateien ohne Folien ab', () => {
    expect(deckPruefen('deck.pdf', 1000, deck)).toMatch(/HTML/)
    expect(deckPruefen('deck.html', GRENZE_DECK + 1, deck)).toMatch(/größer/)
    expect(deckPruefen('tag5_deckG.html', 1000, '<p>nur Text</p>')).toMatch(/keine Folien/)
    // eine Klasse, die "slide" nur enthält, zählt nicht
    expect(deckPruefen('x.html', 1000, '<section class="slideshow">')).toMatch(/keine Folien/)
  })
})

describe('zipPruefen', () => {
  const pk = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

  it('nimmt ein Zip an', () => {
    expect(zipPruefen('Tag5 (Quellen).zip', 1000, pk)).toBeNull()
  })

  it('lehnt falsche Endung, zu große Dateien und Nicht-Zips ab', () => {
    expect(zipPruefen('quellen.rar', 1000, pk)).toMatch(/Zip-Datei/)
    expect(zipPruefen('q.zip', GRENZE_ZIP + 1, pk)).toMatch(/größer/)
    expect(zipPruefen('q.zip', 1000, new Uint8Array([0x3c, 0x68, 0x74, 0x6d]))).toMatch(/kein gültiges/)
  })
})

describe('pruefsumme', () => {
  it('liefert SHA-256 als Hex', async () => {
    const daten = new TextEncoder().encode('abc').buffer as ArrayBuffer
    expect(await pruefsumme(daten)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
