/**
 * Selbsttest der Fassungen auf dem echten Weg (Baustein 4): legt unter Nikos Sync-Anmeldung eine
 * Probe-Fassung an, laedt ein kleines Deck und ein Zip ueber die Storage-API hoch (wie die App), liest
 * beides zurueck, versucht eine nicht erlaubte Datei und loescht danach alles wieder.
 *
 * Aufruf:  npm run pruefen:fassungen
 *
 * Es bleibt nichts zurueck; schlaegt das Aufraeumen fehl, nennt das Skript die Probe-Fassung, damit sie
 * von Hand geloescht werden kann (Titel "Selbsttest – wird geloescht").
 * Kein process.exit() nach Netzwerkanfragen (Absturz unter Windows).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

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
const sha = (b) => createHash('sha256').update(b).digest('hex')
const ergebnisse = []
const pruefe = (name, ok, info = '') => ergebnisse.push({ name, ok, info })

await selbsttest()

async function selbsttest() {
  if (!existsSync(SITZUNGSDATEI)) {
    console.error('Keine gespeicherte Sitzung. Einmal "npm run sync:decks -- --dry" starten.')
    process.exitCode = 1
    return
  }
  const { data: s, error: e1 } = await supabase.auth.refreshSession({
    refresh_token: JSON.parse(readFileSync(SITZUNGSDATEI, 'utf8')).refresh_token,
  })
  if (e1 || !s.session) {
    console.error(`Gespeicherte Sitzung ungueltig: ${e1?.message ?? 'unbekannt'}`)
    process.exitCode = 1
    return
  }
  writeFileSync(SITZUNGSDATEI, JSON.stringify({ refresh_token: s.session.refresh_token }, null, 2))
  const ich = s.session.user.id
  const token = s.session.access_token
  console.log(`Angemeldet als ${s.session.user.email}.`)

  const { data: tag } = await supabase
    .from('kurstage')
    .select('id, quellen_hash')
    .not('quellen_pfad', 'is', null)
    .limit(1)
    .single()

  let id = null
  try {
    // 1. Fassung anlegen
    const { data: neu, error: e2 } = await supabase
      .from('kt_deck_fassungen')
      .insert({ kurstag_id: tag.id, titel: 'Selbsttest – wird gelöscht', grundlage_art: 'original', grundlage_hash: tag.quellen_hash })
      .select('id')
    id = neu?.[0]?.id ?? null
    pruefe('Fassung anlegen und zuruecklesen', Boolean(id), e2?.message)
    if (!id) return

    // 2. Dateien hochladen (wie die App, mit upsert)
    const deck = Buffer.from('<!doctype html><html><body><div id="stage"><section class="slide"><h2 class="folientitel">Selbsttest</h2></section></div></body></html>')
    const zip = await new JSZip().file('Selbsttest/build.json', '{}').generateAsync({ type: 'nodebuffer' })
    const hoch = async (datei, inhalt, typ) =>
      supabase.storage.from('fassungen').upload(`${ich}/${id}/${datei}`, inhalt, { contentType: typ, upsert: true, cacheControl: '0' })
    const r1 = await hoch('deck.html', deck, 'text/html; charset=utf-8')
    const r2 = await hoch('quellen.zip', zip, 'application/zip')
    pruefe('Deck und Zip hochladen', !r1.error && !r2.error, r1.error?.message ?? r2.error?.message)

    // 3. Pfade und Pruefsummen eintragen (Pfad-Pruefung der Datenbank)
    const { data: upd, error: e3 } = await supabase
      .from('kt_deck_fassungen')
      .update({
        deck_pfad: `${ich}/${id}/deck.html`, deck_hash: sha(deck), deck_groesse: deck.length,
        quellen_pfad: `${ich}/${id}/quellen.zip`, quellen_hash: sha(zip), quellen_groesse: zip.length,
      })
      .eq('id', id)
      .select('id')
    pruefe('Pfade und Pruefsummen speichern', upd?.length === 1, e3?.message)

    // 4. Zuruecklesen auf dem Weg der App
    for (const [datei, inhalt] of [['deck.html', deck], ['quellen.zip', zip]]) {
      const a = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/fassungen/${ich}/${id}/${datei}?v=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_ANON_KEY }, cache: 'no-store',
      })
      const zurueck = a.ok ? Buffer.from(await a.arrayBuffer()) : null
      pruefe(`${datei} zuruecklesen, byte-gleich`, Boolean(zurueck && sha(zurueck) === sha(inhalt)), a.ok ? '' : `HTTP ${a.status}`)
    }

    // 5. Neue Version (upsert ersetzt)
    const r3 = await hoch('deck.html', Buffer.concat([deck, Buffer.from('<!-- v2 -->')]), 'text/html; charset=utf-8')
    pruefe('Neue Version hochladen (ersetzen)', !r3.error, r3.error?.message)

    // 6. Verbotenes: andere Datei, fremder Ordner
    const r4 = await hoch('notiz.txt', Buffer.from('x'), 'text/plain')
    pruefe('Nicht erlaubte Datei wird abgelehnt', Boolean(r4.error), r4.error ? '' : 'wurde angenommen')
    const r5 = await supabase.storage.from('fassungen').upload(`00000000-0000-4000-8000-000000000000/${id}/deck.html`, deck, { contentType: 'text/html', upsert: true })
    pruefe('Fremder Ordner wird abgelehnt', Boolean(r5.error), r5.error ? '' : 'wurde angenommen')
  } finally {
    if (id) {
      // 7. Aufraeumen: erst Dateien (braucht Leserecht), dann die Zeile
      const { data: weg, error: e4 } = await supabase.storage.from('fassungen').remove([`${ich}/${id}/deck.html`, `${ich}/${id}/quellen.zip`])
      pruefe('Dateien loeschen', !e4 && weg?.length === 2, e4?.message ?? `${weg?.length ?? 0} von 2`)
      const { data: zeile, error: e5 } = await supabase.from('kt_deck_fassungen').delete().eq('id', id).select('id')
      pruefe('Fassung loeschen', zeile?.length === 1, e5?.message)
      const { data: rest } = await supabase.storage.from('fassungen').list(`${ich}/${id}`)
      pruefe('Nichts uebrig', (rest ?? []).length === 0, `${(rest ?? []).length} Dateien uebrig`)
      if (ergebnisse.some((r) => !r.ok && r.name.startsWith('Fassung loeschen'))) {
        console.log(`  ACHTUNG: Probe-Fassung ${id} von Hand loeschen.`)
      }
    }
  }

  for (const r of ergebnisse) console.log(`${r.ok ? 'ok    ' : 'FEHLER'}  ${r.name}${r.ok || !r.info ? '' : ` (${r.info})`}`)
  const fehler = ergebnisse.filter((r) => !r.ok).length
  console.log(`${ergebnisse.length - fehler} von ${ergebnisse.length} Pruefungen bestanden.`)
  if (fehler) process.exitCode = 1
}
