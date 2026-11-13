/**
 * Fuehrt SQL in der Datenbank des Kurs-Tools aus, ueber die Supabase Management API.
 *
 * Aufruf:  node scripts/sql.mjs datei.sql            (Datei ausfuehren)
 *          node scripts/sql.mjs -e "select 1"        (Befehl direkt)
 *          node scripts/sql.mjs --lesend -e "..."    (nur lesen; jeder Schreibversuch scheitert)
 *          node scripts/sql.mjs --projekte           (zeigt, welche Projekte der Schluessel sieht)
 *
 * Es gibt nur die Live-Datenbank (kein Testprojekt, CLAUDE.md §4). Alles, was hier laeuft,
 * trifft also echte Daten; im Zweifel --lesend verwenden.
 *
 * Der Schluessel kommt aus der Umgebungsvariable SUPABASE_TOKEN_KURSTOOL. Fehlt sie in der
 * laufenden Sitzung (VS Code wurde seit dem Anlegen nicht neu gestartet), liest das Skript sie
 * unter Windows direkt aus den Benutzervariablen. Der Wert wird nie ausgegeben.
 * Bewusst NICHT SUPABASE_ACCESS_TOKEN: diese Variable gehoert zu einem anderen Projekt.
 *
 * Das Zielprojekt ergibt sich aus VITE_SUPABASE_URL in der .env. Der Schluessel sieht mehr als
 * ein Projekt; das Skript erreicht trotzdem nur das, mit dem auch die App spricht.
 *
 * Kein process.exit() nach einem fetch: Node bricht unter Windows sonst mit
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" ab. Fehler setzen deshalb nur den
 * Exit-Code und kehren zurueck.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.supabase.com/v1'

class Abbruch extends Error {}

try {
  await main(process.argv.slice(2))
} catch (e) {
  console.error(e instanceof Abbruch ? e.message : `Unerwarteter Fehler: ${e.message}`)
  process.exitCode = 1
}

async function main(args) {
  const lesend = args.includes('--lesend')
  const direkt = wert(args, '-e')
  const datei = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-e')

  const token = schluessel()
  if (!token) throw new Abbruch('Kein Schluessel: Umgebungsvariable SUPABASE_TOKEN_KURSTOOL fehlt.')

  if (args.includes('--projekte')) {
    const liste = await anfrage(token, 'GET', '/projects')
    ausgeben(liste.map((p) => ({ name: p.name, id: p.id, region: p.region })))
    return
  }

  let sql = direkt ?? (datei ? readFileSync(datei, 'utf8') : null)
  if (!sql) throw new Abbruch('Aufruf: node scripts/sql.mjs <datei.sql> | -e "<sql>" [--lesend] | --projekte')

  // "set transaction read only" muss die erste Anweisung der Transaktion sein; mehrere
  // Anweisungen in einer Anfrage laufen als eine Transaktion. Schreiben scheitert dann.
  if (lesend) sql = `set transaction read only;\n${sql}`

  ausgeben(await anfrage(token, 'POST', `/projects/${projektRef()}/database/query`, { query: sql }))
}

async function anfrage(token, methode, pfad, koerper) {
  const antwort = await fetch(API + pfad, {
    method: methode,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: koerper ? JSON.stringify(koerper) : undefined,
  })
  const text = await antwort.text()
  if (!antwort.ok) throw new Abbruch(`HTTP ${antwort.status}: ${text.replaceAll(token, '***')}`)
  return text ? JSON.parse(text) : null
}

function ausgeben(daten) {
  process.stdout.write(JSON.stringify(daten, null, 2) + '\n')
}

function schluessel() {
  if (process.env.SUPABASE_TOKEN_KURSTOOL) return process.env.SUPABASE_TOKEN_KURSTOOL.trim()
  if (process.platform !== 'win32') return null
  try {
    const aus = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'SUPABASE_TOKEN_KURSTOOL'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const treffer = aus.match(/SUPABASE_TOKEN_KURSTOOL\s+REG_\w+\s+(\S+)/)
    return treffer ? treffer[1].trim() : null
  } catch {
    return null
  }
}

function projektRef() {
  const env = join(WURZEL, '.env')
  if (!existsSync(env)) throw new Abbruch('.env fehlt (VITE_SUPABASE_URL).')
  const treffer = readFileSync(env, 'utf8').match(
    /^\s*VITE_SUPABASE_URL\s*=\s*["']?https:\/\/([a-z0-9]+)\.supabase\.co/m,
  )
  if (!treffer) throw new Abbruch('VITE_SUPABASE_URL in der .env nicht lesbar.')
  return treffer[1]
}

function wert(args, name) {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
