/**
 * Prueft die Quellpakete (Baustein 4): Fuer jeden Kurstag wird das Paket gebaut, in einen leeren
 * Ordner entpackt, darin mit `python engine/build.py .` das Deck gebaut und mit dem fertigen Deck im
 * Kursordner verglichen.
 *
 * Aufruf:  npm run pruefen:quellpakete
 *
 * "identisch" heisst: Das Paket ist vollstaendig und ergibt genau das Deck, das im Tool liegt.
 * "abweichend" heisst meist nicht, dass das Paket falsch ist, sondern dass das Deck im Kursordner
 * aelter ist als seine Quellen oder die Engine (seit dem letzten Bauen geaendert). Dann hilft
 * Neubauen und Syncen. Braucht Python 3. Liest nur, schreibt nur in tmp/.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import JSZip from 'jszip'
import { quellpaketPlanen, quellpaketZippen } from './quellpaket.mjs'

const env = readFileSync('.env', 'utf8')
const wurzel = env.match(/^\s*KURS_WURZEL\s*=\s*["']?(.+?)["']?\s*$/m)[1]
const kurse = JSON.parse(readFileSync('kurse.config.json', 'utf8'))
const anleitung = readFileSync('scripts/quellpaket-anleitung.md', 'utf8')
const kursregeln = '' // fuer den Vergleich unerheblich: KURSREGELN.md fliesst nicht ins Deck
const arbeit = join(process.cwd(), 'tmp', 'pakete')
let gleich = 0, anders = [], ohnePlan = [], groesste = 0, summe = 0
for (const kurs of kurse) {
  const segmente = join(wurzel, kurs.ordner, 'segmente')
  for (const seg of readdirSync(segmente)) {
    const dist = join(segmente, seg, 'dist')
    if (!existsSync(dist)) continue
    for (const datei of readdirSync(dist).filter((d) => /^Tag\d+_Segment\d+\.html$/i.test(d))) {
      const plan = quellpaketPlanen(join(segmente, seg), datei, { anleitung, kursregeln })
      if (!plan) { ohnePlan.push(`${kurs.slug}/${datei}`); continue }
      const zip = await quellpaketZippen(plan)
      groesste = Math.max(groesste, zip.length); summe += zip.length
      rmSync(arbeit, { recursive: true, force: true })
      const inhalt = await JSZip.loadAsync(zip)
      for (const [name, eintrag] of Object.entries(inhalt.files)) {
        if (eintrag.dir) continue
        const ziel = join(arbeit, name); mkdirSync(dirname(ziel), { recursive: true })
        writeFileSync(ziel, await eintrag.async('nodebuffer'))
      }
      const paketOrdner = join(arbeit, plan.ordnername)
      execFileSync('python', ['engine/build.py', '.'], { cwd: paketOrdner, stdio: 'pipe' })
      const gebaut = readFileSync(join(paketOrdner, 'dist', datei))
      const original = readFileSync(join(dist, datei))
      if (gebaut.equals(original)) gleich++
      else anders.push(`${kurs.slug}/${datei} (${gebaut.length} statt ${original.length} Bytes)`)
    }
  }
}
rmSync(arbeit, { recursive: true, force: true })
console.log(`Pakete gebaut und geprueft: ${gleich} identisch mit dem fertigen Deck, ${anders.length} abweichend, ${ohnePlan.length} ohne Bauplan.`)
console.log(`Groesstes Paket ${(groesste/1048576).toFixed(1)} MB, alle zusammen ${(summe/1048576).toFixed(1)} MB.`)
for (const a of anders) console.log('  abweichend (Deck aelter als die Quellen?):', a)
for (const o of ohnePlan) console.log('  ohne Bauplan:', o)
