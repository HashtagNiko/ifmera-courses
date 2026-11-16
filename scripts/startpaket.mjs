/**
 * Startpaket für eigene Kurse (SPEC.md, Baustein 10): alles, was Claude braucht, um mit einem Trainer
 * einen neuen Kurs zu planen und dessen Decks zu bauen, in einem Zip.
 *
 *   ifmera-Startpaket/
 *     CLAUDE.md               Anleitung für den ganzen Kurs     (scripts/startpaket/ANLEITUNG.md)
 *     KURSPLAN.md             Vorlage für den Kursplan          (scripts/startpaket/KURSPLAN.md)
 *     _vorlage-kurstag/       Vorlage für einen Kurstag; je Tag kopiert zu Tag1/, Tag2/ …
 *       CLAUDE.md             Anleitung für einen Kurstag        (scripts/startpaket/KURSTAG.md)
 *       KURSREGELN.md         Gestaltungsregeln des Kursautors   (wie in den Quellpaketen)
 *       build.json            Bauplan für das Beispiel
 *       engine/…              Engine, build.py, teilnehmer.py, pdf.py des Kursautors; pdf_fassung.py
 *       slides/tag.html       vier erfundene Beispielfolien      (scripts/startpaket/tag1.html)
 *       anlagen/…             Logo und Bildmarke
 *
 * Engine, Build und Bilder kommen aus dem Kursordner (KURS_WURZEL), nicht aus dem öffentlichen Repo.
 * Die H&G-Engine, weil sie die „Brücken“ im Cockpit zeigt.
 *
 * Abgelegt im privaten Bucket "kt-vorlagen" als startpaket.zip: lesen darf jeder aktive Trainer, schreiben
 * nur der Admin (Migration 20261116100000). Der Deck-Sync lädt es hoch, wenn es sich geändert hat.
 * Zeitstempel im Zip sind fest; gleicher Inhalt ergibt dasselbe Zip.
 *
 * Von Hand bauen, etwa zum Ausprobieren:  node scripts/startpaket.mjs <ziel.zip>
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { kursregelnLesen } from './quellpaket.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const FESTES_DATUM = new Date('2026-01-01T00:00:00Z')
export const STARTPAKET_BUCKET = 'kt-vorlagen'
export const STARTPAKET_PFAD = 'startpaket.zip'
const OBEN = 'ifmera-Startpaket'
const VORLAGE = '_vorlage-kurstag'

/** Woher die Teile des Kursautors kommen, relativ zu KURS_WURZEL */
export const QUELLEN = {
  engine: '50_H&G-Kurs/engine',
  anlagen: '50_H&G-Kurs/segmente/Segment1/anlagen',
  regeln: '10_WEG-Kurs/CLAUDE.md',
}
const BILDER = { LOGO: 'ifmera-logo-hell-auf-dunkel.png', MARK: 'ifmera-bildmarke.png' }

const sha256 = (daten) => createHash('sha256').update(daten).digest('hex')
// Zeilenenden vereinheitlichen, damit die Prüfsumme nicht davon abhängt, wie Git ausgecheckt hat
const text = (pfad) => readFileSync(pfad, 'utf8').replace(/\r\n/g, '\n')

function muss(pfad) {
  if (!existsSync(pfad)) throw new Error(`Für das Startpaket fehlt: ${pfad}`)
  return pfad
}

/** Plant das Startpaket: Liste { ziel, inhalt } und eine Prüfsumme über alles. */
export function startpaketPlanen(kursWurzel) {
  const dateien = []
  const ablegen = (ziel, inhalt) => dateien.push({ ziel, inhalt })
  const vorlage = (p) => `${VORLAGE}/${p}`

  ablegen('CLAUDE.md', text(join(HIER, 'startpaket', 'ANLEITUNG.md')))
  ablegen('KURSPLAN.md', text(join(HIER, 'startpaket', 'KURSPLAN.md')))

  ablegen(vorlage('CLAUDE.md'), text(join(HIER, 'startpaket', 'KURSTAG.md')))
  const regeln = kursregelnLesen(muss(join(kursWurzel, QUELLEN.regeln)))
  if (!regeln) throw new Error('Die Gestaltungsregeln (Abschnitte 3 bis 6) fehlen in der Kurs-Anleitung.')
  ablegen(vorlage('KURSREGELN.md'), regeln)
  const bauplan = {
    engine: 'engine/deck_engine.html',
    builds: [
      {
        name: 'Tag1',
        title: 'ifmera · Titel des Kurses · Tag 1 von 3 — Thema des Tages',
        slides: ['slides/tag.html'],
        out: 'dist/Tag1.html',
        images: Object.fromEntries(Object.entries(BILDER).map(([k, d]) => [k, `anlagen/${d}`])),
      },
    ],
  }
  ablegen(vorlage('build.json'), JSON.stringify(bauplan, null, 2) + '\n')
  for (const datei of ['deck_engine.html', 'build.py', 'teilnehmer.py', 'pdf.py']) {
    ablegen(vorlage(`engine/${datei}`), readFileSync(muss(join(kursWurzel, QUELLEN.engine, datei))))
  }
  ablegen(vorlage('engine/pdf_fassung.py'), text(join(HIER, 'paket', 'pdf_fassung.py')))
  ablegen(vorlage('slides/tag.html'), text(join(HIER, 'startpaket', 'tag1.html')))
  for (const datei of Object.values(BILDER)) {
    ablegen(vorlage(`anlagen/${datei}`), readFileSync(muss(join(kursWurzel, QUELLEN.anlagen, datei))))
  }

  const pruefsumme = sha256(JSON.stringify(dateien.map((d) => [d.ziel, sha256(d.inhalt)])))
  return { dateien, pruefsumme }
}

export async function startpaketZippen(plan) {
  const zip = new JSZip()
  // Ordner-Einträge bekämen sonst die aktuelle Uhrzeit (JSZip legt sie von selbst an); dann wäre jedes Zip
  // anders und der Sync lüde das Startpaket bei jedem Lauf neu. Deshalb alle Ordner selbst mit festem Datum
  // anlegen und das automatische Anlegen abschalten.
  const ordner = new Set()
  for (const d of plan.dateien) {
    const teile = `${OBEN}/${d.ziel}`.split('/').slice(0, -1)
    for (let i = 1; i <= teile.length; i++) ordner.add(teile.slice(0, i).join('/') + '/')
  }
  for (const o of [...ordner].sort()) zip.file(o, null, { dir: true, date: FESTES_DATUM, createFolders: false })
  const optionen = { date: FESTES_DATUM, compression: 'DEFLATE', compressionOptions: { level: 6 }, createFolders: false }
  for (const d of plan.dateien) zip.file(`${OBEN}/${d.ziel}`, d.inhalt, optionen)
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
}

/**
 * Lädt das Startpaket hoch, wenn es sich vom vorhandenen unterscheidet (Vergleich der Zip-Bytes; das Zip
 * ist dank fester Zeitstempel reproduzierbar). Rückgabe: 'neu', 'gleich' oder 'probelauf'.
 */
export async function startpaketAbgleichen(supabase, kursWurzel, { trocken = false } = {}) {
  const zip = await startpaketZippen(startpaketPlanen(kursWurzel))
  const { data: alt } = await supabase.storage.from(STARTPAKET_BUCKET).download(STARTPAKET_PFAD)
  if (alt && sha256(Buffer.from(await alt.arrayBuffer())) === sha256(zip)) return 'gleich'
  if (trocken) return 'probelauf'
  const { error } = await supabase.storage
    .from(STARTPAKET_BUCKET)
    .upload(STARTPAKET_PFAD, zip, { contentType: 'application/zip', upsert: true, cacheControl: '0' })
  if (error) throw new Error(`Startpaket nicht hochgeladen: ${error.message}`)
  return 'neu'
}

// Aufruf von Hand: node scripts/startpaket.mjs <ziel.zip>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ziel = process.argv[2]
  const env = readFileSync(join(HIER, '..', '.env'), 'utf8')
  const wurzel = env.match(/^\s*KURS_WURZEL\s*=\s*["']?(.+?)["']?\s*$/m)?.[1]
  if (!ziel || !wurzel) {
    console.error('Aufruf: node scripts/startpaket.mjs <ziel.zip>   (KURS_WURZEL aus der .env)')
    process.exitCode = 1
  } else {
    const plan = startpaketPlanen(wurzel)
    writeFileSync(ziel, await startpaketZippen(plan))
    console.log(`Startpaket: ${plan.dateien.length} Dateien, Prüfsumme ${plan.pruefsumme.slice(0, 12)}`)
  }
}
