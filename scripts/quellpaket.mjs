/**
 * Quellpaket eines Kurstags (SPEC.md, Baustein 4): alles, was man braucht, um das Deck
 * eines Tages mit Claude zu bearbeiten und selbst zu bauen, in einem Zip.
 *
 *   <TagX_SegmentN>/
 *     CLAUDE.md          Anleitung (scripts/quellpaket-anleitung.md)
 *     KURSREGELN.md      Gestaltungsregeln des Kurses (Abschnitte 3–6 der CLAUDE.md im Kursordner)
 *     build.json         Bauplan nur fuer diesen Tag, mit Pfaden innerhalb des Pakets
 *     engine/deck_engine.html, engine/build.py
 *     slides/…           Folienquellen
 *     anlagen/…          Bilder
 *
 * Gebaut wird im entpackten Ordner mit `python engine/build.py .`; das Ergebnis landet in dist/.
 *
 * Die Bauplaene im Kursordner verweisen teils ausserhalb ihres Segments (die Kompaktfassungen
 * holen Bilder aus dem Vollkurs, "../../../segmente/…"). Im Paket liegt deshalb jede Datei unter
 * slides/ oder anlagen/, und der Bauplan zeigt dorthin. Gleiche Dateinamen aus verschiedenen
 * Ordnern bekommen eine Nummer.
 *
 * Ob sich ein Paket geaendert hat, sagt eine Pruefsumme ueber Bauplan, Dateien und Anleitung,
 * nicht die des Zips (Zips enthalten Zeitstempel). Die Zeitstempel im Zip sind fest, damit
 * gleicher Inhalt gleiches Zip ergibt.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import JSZip from 'jszip'

const FESTES_DATUM = new Date('2026-01-01T00:00:00Z')

const sha256 = (daten) => createHash('sha256').update(daten).digest('hex')

/**
 * Plant das Paket fuer ein gebautes Deck. segmentOrdner = .../segmente/SegmentN,
 * deckDatei = "Tag5_Segment2.html". Ohne passenden Bauplan: null.
 */
export function quellpaketPlanen(segmentOrdner, deckDatei, { anleitung = '', kursregeln = '' } = {}) {
  const bauplanPfad = join(segmentOrdner, 'build.json')
  if (!existsSync(bauplanPfad)) return null
  const bauplan = JSON.parse(readFileSync(bauplanPfad, 'utf8'))
  const build = bauplan.builds.find((b) => b.out.replace(/\\/g, '/') === `dist/${deckDatei}`)
  if (!build) return null

  const engine = resolve(segmentOrdner, bauplan.engine)
  const buildPy = join(dirname(engine), 'build.py')
  if (!existsSync(engine) || !existsSync(buildPy)) return null

  const dateien = [] // { ziel, quelle }
  const vergeben = new Set()
  const ablegen = (ordner, quelle) => {
    const endung = extname(quelle)
    const stamm = basename(quelle, endung)
    let ziel = `${ordner}/${stamm}${endung}`
    for (let n = 2; vergeben.has(ziel.toLowerCase()); n++) ziel = `${ordner}/${stamm}-${n}${endung}`
    vergeben.add(ziel.toLowerCase())
    dateien.push({ ziel, quelle })
    return ziel
  }

  const slides = build.slides.map((s) => ablegen('slides', resolve(segmentOrdner, s)))
  const images = {}
  for (const [schluessel, pfad] of Object.entries(build.images ?? {})) {
    images[schluessel] = ablegen('anlagen', resolve(segmentOrdner, pfad))
  }
  for (const d of dateien) {
    if (!existsSync(d.quelle)) throw new Error(`Datei aus dem Bauplan fehlt: ${d.quelle}`)
  }
  dateien.push({ ziel: 'engine/deck_engine.html', quelle: engine })
  dateien.push({ ziel: 'engine/build.py', quelle: buildPy })

  const paketBauplan = {
    engine: 'engine/deck_engine.html',
    builds: [{ name: build.name, title: build.title, slides, out: `dist/${deckDatei}`, images }],
  }
  const texte = {
    'build.json': JSON.stringify(paketBauplan, null, 2) + '\n',
    'CLAUDE.md': anleitung,
    ...(kursregeln ? { 'KURSREGELN.md': kursregeln } : {}),
  }

  const pruefsumme = sha256(
    JSON.stringify({
      texte: Object.entries(texte).map(([n, t]) => [n, sha256(t)]),
      dateien: dateien.map((d) => [d.ziel, sha256(readFileSync(d.quelle))]),
    }),
  )
  return { ordnername: deckDatei.replace(/\.html$/i, ''), dateien, texte, pruefsumme }
}

/** Erzeugt das Zip zu einem Plan. */
export async function quellpaketZippen(plan) {
  const zip = new JSZip()
  const ordner = zip.folder(plan.ordnername)
  const optionen = { date: FESTES_DATUM, compression: 'DEFLATE', compressionOptions: { level: 6 } }
  for (const [name, text] of Object.entries(plan.texte)) ordner.file(name, text, optionen)
  for (const d of plan.dateien) ordner.file(d.ziel, readFileSync(d.quelle), optionen)
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
}

/**
 * Gestaltungsregeln eines Kurses: die Abschnitte "## 3." bis vor "## 7." aus einer CLAUDE.md
 * (Design-Tokens, Komponenten, harte Regeln, Detailtiefe). Fehlt die Datei: leer.
 */
export function kursregelnLesen(pfad) {
  if (!pfad || !existsSync(pfad)) return ''
  const text = readFileSync(pfad, 'utf8')
  const anfang = text.search(/^## 3\./m)
  const ende = text.search(/^## 7\./m)
  if (anfang === -1) return ''
  return (
    '# Gestaltungsregeln des Kurses\n\n' +
    '> Auszug aus der Arbeitsanweisung des Kursautors. Bitte einhalten, damit alle Fassungen gleich aussehen.\n\n' +
    text.slice(anfang, ende === -1 ? undefined : ende).trim() +
    '\n'
  )
}
