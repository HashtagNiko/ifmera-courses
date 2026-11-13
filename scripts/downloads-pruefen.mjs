/**
 * Prueft die Downloads auf dem echten Weg: Jede Datei, die das Tool zum Oeffnen
 * oder Herunterladen anbietet (Trainer-Deck, Teilnehmerfassung, PDF), wird so aus
 * dem Bucket geholt, wie es die App tut, und ihre Pruefsumme mit der in kurstage
 * verglichen.
 *
 * Aufruf:  npm run pruefen:downloads
 *
 * Angemeldet wird mit der gespeicherten Sitzung des Deck-Syncs (.sync-session.json),
 * also als Niko. Nur lesend; die erneuerte Sitzung wird wie beim Sync gespeichert.
 * Fehlt die Sitzung: einmal "npm run sync:decks -- --dry" in einer Konsole starten.
 *
 * Kein process.exit() nach Netzwerkanfragen (Absturz unter Windows), siehe sync-decks.mjs.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITZUNGSDATEI = join(WURZEL, '.sync-session.json')
const env = Object.fromEntries(
  readFileSync(join(WURZEL, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((z) => z.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i))
    .filter(Boolean)
    .map((t) => [t[1], t[2].replace(/^["']|["']$/g, '')]),
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

await pruefen()

async function pruefen() {
  if (!existsSync(SITZUNGSDATEI)) {
    console.error('Keine gespeicherte Sitzung. Einmal "npm run sync:decks -- --dry" starten.')
    process.exitCode = 1
    return
  }
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: JSON.parse(readFileSync(SITZUNGSDATEI, 'utf8')).refresh_token,
  })
  if (error || !data.session) {
    console.error(`Gespeicherte Sitzung ungueltig: ${error?.message ?? 'unbekannt'}`)
    process.exitCode = 1
    return
  }
  writeFileSync(SITZUNGSDATEI, JSON.stringify({ refresh_token: data.session.refresh_token }, null, 2))
  const token = data.session.access_token
  console.log(`Angemeldet als ${data.session.user.email}.`)

  const { data: tage, error: lesefehler } = await supabase
    .from('kurstage')
    .select('nummer, deck_pfad, deck_hash, teilnehmer_pfad, teilnehmer_hash, pdf_pfad, pdf_hash, kurse(slug)')
    .eq('art', 'kurstag')
  if (lesefehler) {
    console.error(`kurstage nicht lesbar: ${lesefehler.message}`)
    process.exitCode = 1
    return
  }

  const dateien = tage.flatMap((t) =>
    [
      ['Trainer', t.deck_pfad, t.deck_hash],
      ['Teilnehmer', t.teilnehmer_pfad, t.teilnehmer_hash],
      ['PDF', t.pdf_pfad, t.pdf_hash],
    ]
      .filter(([, pfad]) => pfad)
      .map(([art, pfad, hash]) => ({ kurs: t.kurse?.slug, nummer: t.nummer, art, pfad, hash })),
  )

  let gut = 0
  const schlecht = []
  for (const d of dateien) {
    const kodiert = d.pfad.split('/').map(encodeURIComponent).join('/')
    const antwort = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/decks/${kodiert}?v=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_ANON_KEY },
      cache: 'no-store',
    })
    if (!antwort.ok) {
      schlecht.push(`${d.kurs} Tag ${d.nummer} ${d.art}: HTTP ${antwort.status}`)
      continue
    }
    const hash = createHash('sha256').update(Buffer.from(await antwort.arrayBuffer())).digest('hex')
    if (hash === d.hash) gut++
    else schlecht.push(`${d.kurs} Tag ${d.nummer} ${d.art}: Pruefsumme weicht ab`)
  }

  const nachArt = (art) => dateien.filter((d) => d.art === art).length
  console.log(
    `${dateien.length} Dateien geprueft (Trainer ${nachArt('Trainer')}, Teilnehmer ${nachArt('Teilnehmer')}, PDF ${nachArt('PDF')}): ` +
      `${gut} in Ordnung, ${schlecht.length} fehlerhaft.`,
  )
  for (const s of schlecht) console.log(`  ${s}`)
  if (schlecht.length) process.exitCode = 1
}
