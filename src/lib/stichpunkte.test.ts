import { describe, expect, it } from 'vitest'
import { pfadeFuer } from './kurse'
import { notizenModus } from './trainer'

/** Baustein 7: Wer welche Dateien bekommt. Durchgesetzt wird es von der Datenbank; hier nur die Wahl. */
describe('Stichpunkt-Fassung in der App', () => {
  const tag = {
    deck_pfad: 'hg/trainer/Tag3.html',
    quellen_pfad: 'hg/quellen/Tag3.zip',
    quellen_hash: 'voll',
    trainer_kurz_pfad: 'hg/trainer-kurz/Tag3.html',
    quellen_kurz_pfad: 'hg/quellen-kurz/Tag3.zip',
    quellen_kurz_hash: 'kurz',
  }

  it('wählt bei "stichpunkte" nur die kurzen Fassungen, nie die ausführlichen', () => {
    expect(pfadeFuer(tag, 'voll')).toEqual({ deck: 'hg/trainer/Tag3.html', quellen: 'hg/quellen/Tag3.zip', quellenHash: 'voll' })
    expect(pfadeFuer(tag, 'stichpunkte')).toEqual({
      deck: 'hg/trainer-kurz/Tag3.html',
      quellen: 'hg/quellen-kurz/Tag3.zip',
      quellenHash: 'kurz',
    })
    // ohne kurze Fassung: kein Deck statt der ausführlichen
    expect(pfadeFuer({ ...tag, trainer_kurz_pfad: null, quellen_kurz_pfad: null }, 'stichpunkte')).toEqual({
      deck: null,
      quellen: null,
      quellenHash: 'kurz',
    })
  })

  it('Besitzer bekommt immer die ausführlichen Notizen, Mitnutzer nach Freigabe', () => {
    expect(notizenModus('niko', 'niko', { stufe: 'nutzen', umfang: 'stichpunkte' })).toBe('voll')
    expect(notizenModus('niko', 'co', { stufe: 'fassung', umfang: 'stichpunkte' })).toBe('stichpunkte')
    expect(notizenModus('niko', 'co', { stufe: 'fassung', umfang: 'voll' })).toBe('voll')
    expect(notizenModus('niko', 'co', undefined)).toBe('voll')
  })
})
