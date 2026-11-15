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

// Tests gehoeren zu einer Migration (gleicher Zeitstempel vorn). Ist die noch nicht eingespielt (etwa ein
// gelber Schritt, der auf Nikos "ja" wartet), wird ihr Test uebersprungen statt als Fehler gemeldet.
const eingespielt = new Set(
  JSON.parse(
    execFileSync(process.execPath, [join(WURZEL, 'scripts', 'sql.mjs'), '--lesend', join(WURZEL, 'supabase', 'eingespielt.sql')], {
      encoding: 'utf8',
    }),
  ).map((z) => z.version),
)

let fehler = 0
let uebersprungen = 0
for (const test of tests) {
  const version = test.slice(0, 14)
  if (/^\d{14}$/.test(version) && !eingespielt.has(version)) {
    uebersprungen++
    console.log(`--      ${test} (Migration noch nicht eingespielt, uebersprungen)`)
    continue
  }
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
console.log(
  `${tests.length - fehler - uebersprungen} von ${tests.length - uebersprungen} Rechte-Tests bestanden` +
    (uebersprungen ? `, ${uebersprungen} uebersprungen (Migration noch nicht eingespielt).` : '.'),
)
if (fehler) process.exitCode = 1
