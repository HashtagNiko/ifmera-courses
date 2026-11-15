// @vitest-environment node
/**
 * Teilnehmerfassung aus dem Tool gegen Nikos echte: Für jedes gebaute Deck in den Kursordnern (beide Kurse,
 * voll und kompakt), zu dem es eine fertige Teilnehmerfassung gibt, muss teilnehmerFassung() Byte für Byte
 * dasselbe ergeben wie engine/teilnehmer.py. Die Decks liegen nicht im Repo; ohne KURS_WURZEL (etwa auf
 * GitHub) wird der Test übersprungen.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { teilnehmerFassung } from './teilnehmer'

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
const wurzel = env.match(/^\s*KURS_WURZEL\s*=\s*["']?(.+?)["']?\s*$/m)?.[1]

const paare: { name: string; deck: string; teilnehmer: string }[] = []
if (wurzel && existsSync(wurzel)) {
  for (const kurs of ['10_WEG-Kurs', '50_H&G-Kurs']) {
    for (const basis of [join(wurzel, kurs, 'segmente'), join(wurzel, kurs, 'kompakt', 'segmente')]) {
      if (!existsSync(basis)) continue
      for (const seg of readdirSync(basis)) {
        const dist = join(basis, seg, 'dist')
        if (!existsSync(dist)) continue
        for (const d of readdirSync(dist).filter((x) => /^Tag\d+_Segment\d+\.html$/.test(x))) {
          const tn = join(dist, 'teilnehmer', d)
          if (existsSync(tn)) paare.push({ name: `${kurs}/${basis.includes('kompakt') ? 'kompakt/' : ''}${d}`, deck: join(dist, d), teilnehmer: tn })
        }
      }
    }
  }
}

describe.skipIf(paare.length === 0)('Teilnehmerfassung wie teilnehmer.py', () => {
  it(`ergibt für alle ${paare.length} Decks byte-genau Nikos Teilnehmerfassung`, () => {
    const abweichend: string[] = []
    for (const p of paare) {
      const { html, bericht } = teilnehmerFassung(readFileSync(p.deck, 'utf8'))
      expect(bericht.offen, p.name).toEqual([])
      if (html !== readFileSync(p.teilnehmer, 'utf8')) abweichend.push(p.name)
    }
    expect(abweichend).toEqual([])
    expect(paare.length).toBeGreaterThan(40)
  }, 120000)
})
