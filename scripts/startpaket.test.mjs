// @vitest-environment node
/**
 * Startpaket (Baustein 10): Inhalt, reproduzierbares Zip und ein echter Durchlauf wie beim Trainer
 * (entpacken, Kurstag-Ordner anlegen, mit Python bauen, Teilnehmerfassung im Tool). Engine und Bilder
 * liegen nur im Kursordner; ohne KURS_WURZEL (etwa auf GitHub) wird der Test übersprungen, ohne Python
 * der Bau-Teil.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { startpaketPlanen, startpaketZippen } from './startpaket.mjs'
import { folienLesen } from './stichpunkte.mjs'
import { teilnehmerFassung } from '../src/lib/teilnehmer.ts'

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
const wurzel = env.match(/^\s*KURS_WURZEL\s*=\s*["']?(.+?)["']?\s*$/m)?.[1]
const daHatKurse = Boolean(wurzel && existsSync(wurzel))

function python() {
  for (const p of ['python', 'python3']) {
    try {
      execFileSync(p, ['--version'], { stdio: 'ignore' })
      return p
    } catch {
      /* nächster */
    }
  }
  return null
}

describe.skipIf(!daHatKurse)('Startpaket', () => {
  it('enthält genau die vorgesehenen Dateien, ohne Kursinhalte', () => {
    const plan = startpaketPlanen(wurzel)
    expect(plan.dateien.map((d) => d.ziel).sort()).toEqual(
      [
        'CLAUDE.md',
        'KURSPLAN.md',
        '_vorlage-kurstag/CLAUDE.md',
        '_vorlage-kurstag/KURSREGELN.md',
        '_vorlage-kurstag/anlagen/ifmera-bildmarke.png',
        '_vorlage-kurstag/anlagen/ifmera-logo-hell-auf-dunkel.png',
        '_vorlage-kurstag/build.json',
        '_vorlage-kurstag/engine/build.py',
        '_vorlage-kurstag/engine/deck_engine.html',
        '_vorlage-kurstag/engine/pdf.py',
        '_vorlage-kurstag/engine/pdf_fassung.py',
        '_vorlage-kurstag/engine/teilnehmer.py',
        '_vorlage-kurstag/slides/tag.html',
      ].sort(),
    )
    const bauplan = JSON.parse(plan.dateien.find((d) => d.ziel.endsWith('build.json')).inhalt)
    expect(bauplan.builds[0].out).toBe('dist/Tag1.html')
    // die Anleitungen heißen im Paket CLAUDE.md, im Repo nicht (sonst läsen sie hier als Arbeitsanweisung mit)
    expect(existsSync(join('scripts', 'startpaket', 'CLAUDE.md'))).toBe(false)
  })

  it('gleicher Inhalt ergibt dasselbe Zip; Paketordner heißt ifmera-Startpaket', async () => {
    const a = await startpaketZippen(startpaketPlanen(wurzel))
    const b = await startpaketZippen(startpaketPlanen(wurzel))
    expect(Buffer.compare(a, b)).toBe(0)
    const zip = await JSZip.loadAsync(a)
    expect(Object.keys(zip.files).every((n) => n.startsWith('ifmera-Startpaket/'))).toBe(true)
    // jeder Eintrag, auch jeder Ordner, trägt das feste Datum (sonst ist jedes Zip anders und der Sync lädt
    // bei jedem Lauf neu hoch; so am 16.11.2026 passiert, der Vergleich zweier Zips derselben Sekunde sah es nicht)
    const daten = new Set(Object.values(zip.files).map((e) => e.date.toISOString().slice(0, 10)))
    expect([...daten]).toEqual(['2026-01-01'])
    expect(zip.files['ifmera-Startpaket/_vorlage-kurstag/engine/'].dir).toBe(true)
  })

  it.skipIf(!python())('baut beim Trainer: Kurstag-Ordner aus der Vorlage, Deck mit 4 Folien, saubere Teilnehmerfassung', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'kt-startpaket-'))
    try {
      const zip = await JSZip.loadAsync(await startpaketZippen(startpaketPlanen(wurzel)))
      for (const [name, eintrag] of Object.entries(zip.files)) {
        if (eintrag.dir) continue
        const ziel = join(ordner, name)
        mkdirSync(dirname(ziel), { recursive: true })
        writeFileSync(ziel, await eintrag.async('nodebuffer'))
      }
      const tag = join(ordner, 'ifmera-Startpaket', 'Tag1')
      cpSync(join(ordner, 'ifmera-Startpaket', '_vorlage-kurstag'), tag, { recursive: true })
      execFileSync(python(), [join('engine', 'build.py'), '.'], { cwd: tag, stdio: 'pipe' })
      const deck = readFileSync(join(tag, 'dist', 'Tag1.html'), 'utf8')
      const folien = folienLesen(deck)
      expect(folien).toHaveLength(4)
      expect(folien.every((f) => f.notiz && f.notiz.length > 20)).toBe(true)
      expect(deck).not.toMatch(/\{\{[A-Z0-9_]+\}\}/)
      const { html, bericht } = teilnehmerFassung(deck)
      expect(bericht.offen).toEqual([])
      expect(bericht.notizen).toBeGreaterThanOrEqual(10)
      expect(html).not.toContain('Hier steht, was der Trainer sagt')
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  }, 60000)
})
