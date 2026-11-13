/**
 * Fuehrt alle Rechte-Tests aus supabase/tests/ gegen die Live-Datenbank aus (CLAUDE.md §4 Nr. 5).
 *
 * Aufruf:  npm run pruefen:rechte
 *
 * Jeder Test laeuft in einer eigenen Transaktion und endet mit ROLLBACK; es bleibt nichts zurueck.
 * Nach jeder Migration laufen ALLE Tests, nicht nur der neue (CLAUDE.md §4 Nr. 4).
 */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const tests = readdirSync(join(WURZEL, 'supabase', 'tests')).filter((d) => d.endsWith('.sql')).sort()

let fehler = 0
for (const test of tests) {
  try {
    execFileSync(process.execPath, [join(WURZEL, 'scripts', 'sql.mjs'), join(WURZEL, 'supabase', 'tests', test)], {
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf8',
    })
    console.log(`ok      ${test}`)
  } catch (e) {
    fehler++
    console.log(`FEHLER  ${test}\n        ${String(e.stderr ?? e.message).trim().slice(0, 400)}`)
  }
}
console.log(`${tests.length - fehler} von ${tests.length} Rechte-Tests bestanden.`)
if (fehler) process.exitCode = 1
