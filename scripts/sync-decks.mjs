/**
 * Laedt geaenderte Trainer-Decks aus dem lokalen Kursordner in den privaten
 * Supabase-Bucket "decks" und haelt die Tabelle public.kurstage aktuell.
 *
 * Aufruf:  npm run sync:decks            (alle Kurstage pruefen)
 *          npm run sync:decks -- --dry   (nur zeigen, was passieren wuerde)
 *
 * Verglichen wird per sha256: hochgeladen wird nur, was sich seit dem letzten
 * Lauf wirklich geaendert hat. Die Quelle bleibt der lokale Ordner, damit
 * OneDrive und Tool nicht auseinanderlaufen.
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = ladeEnv(join(WURZEL, '.env'))

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const QUELLE = env.DECK_QUELLE
const KURS_SLUG = 'weg'
const BUCKET = 'decks'
const TROCKEN = process.argv.includes('--dry')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Fehlt in .env: VITE_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!QUELLE || !existsSync(QUELLE)) {
  console.error(`DECK_QUELLE nicht gefunden: ${QUELLE}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const { data: kurs, error: kursFehler } = await supabase
  .from('kurse')
  .select('id')
  .eq('slug', KURS_SLUG)
  .single()

if (kursFehler || !kurs) {
  console.error(`Kurs "${KURS_SLUG}" nicht gefunden. Migration schon eingespielt?`)
  process.exit(1)
}

const decks = await findeDecks(join(QUELLE, 'segmente'))
if (decks.length === 0) {
  console.error(`Keine Decks unter ${join(QUELLE, 'segmente')} gefunden.`)
  process.exit(1)
}
console.log(`${decks.length} Trainer-Decks gefunden.`)

const { data: bestand } = await supabase
  .from('kurstage')
  .select('nummer, deck_hash')
  .eq('kurs_id', kurs.id)

const bekannt = new Map((bestand ?? []).map((z) => [z.nummer, z.deck_hash]))

let geladen = 0
let uebersprungen = 0

for (const deck of decks.sort((a, b) => a.nummer - b.nummer)) {
  const inhalt = await readFile(deck.pfad)
  const hash = createHash('sha256').update(inhalt).digest('hex')

  if (bekannt.get(deck.nummer) === hash) {
    uebersprungen++
    continue
  }

  const zielPfad = `${KURS_SLUG}/trainer/${basename(deck.pfad)}`
  console.log(`  Tag ${deck.nummer}: geaendert -> ${zielPfad} (${mb(inhalt.length)})`)

  if (TROCKEN) {
    geladen++
    continue
  }

  const { error: uploadFehler } = await supabase.storage
    .from(BUCKET)
    .upload(zielPfad, inhalt, { contentType: 'text/html; charset=utf-8', upsert: true })

  if (uploadFehler) {
    console.error(`  Fehler beim Upload von Tag ${deck.nummer}: ${uploadFehler.message}`)
    process.exitCode = 1
    continue
  }

  const { error: schreibFehler } = await supabase.from('kurstage').upsert(
    {
      kurs_id: kurs.id,
      nummer: deck.nummer,
      segment: deck.segment,
      titel: deck.titel,
      deck_pfad: zielPfad,
      deck_hash: hash,
      deck_groesse: inhalt.length,
      deck_aktualisiert_am: new Date().toISOString(),
    },
    { onConflict: 'kurs_id,nummer' },
  )

  if (schreibFehler) {
    console.error(`  Fehler beim Eintrag von Tag ${deck.nummer}: ${schreibFehler.message}`)
    process.exitCode = 1
    continue
  }
  geladen++
}

console.log(
  TROCKEN
    ? `Probelauf: ${geladen} Deck(s) waeren geladen worden, ${uebersprungen} unveraendert.`
    : `Fertig: ${geladen} Deck(s) geladen, ${uebersprungen} unveraendert.`,
)

/** Liest eine .env ohne Zusatzpaket: KEY=VALUE je Zeile, # ist Kommentar. */
function ladeEnv(pfad) {
  if (!existsSync(pfad)) return {}
  const werte = {}
  for (const zeile of readFileSync(pfad, 'utf8').split(/\r?\n/)) {
    const treffer = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (treffer) werte[treffer[1]] = treffer[2].replace(/^["']|["']$/g, '')
  }
  return werte
}

/**
 * Sammelt die Trainer-Fassungen: segmente/SegmentN/dist/TagX_SegmentN.html.
 * Der Unterordner "teilnehmer" bleibt aussen vor, im Tool brauchen wir nur die
 * Trainer-Fassung. Die Bucket-Struktur (…/trainer/…) laesst Platz dafuer.
 */
async function findeDecks(segmenteOrdner) {
  const gefunden = []
  for (const segment of await readdir(segmenteOrdner)) {
    const distOrdner = join(segmenteOrdner, segment, 'dist')
    if (!existsSync(distOrdner)) continue

    for (const datei of await readdir(distOrdner)) {
      const voll = join(distOrdner, datei)
      if (!(await stat(voll)).isFile()) continue
      const treffer = datei.match(/^Tag(\d+)_Segment(\d+)\.html$/i)
      if (!treffer) continue
      gefunden.push({
        pfad: voll,
        nummer: Number(treffer[1]),
        segment: Number(treffer[2]),
        titel: await leseTitel(voll),
      })
    }
  }
  return gefunden
}

/**
 * Holt den <title> aus dem Deck; dafuer reicht der Anfang der Datei.
 * Die Decks tragen dort die lange Form
 * "ifmera · Rechtliche Grundlagen · Tag 3 von 6 — Die Eigentuemerversammlung".
 * Fuer die Kacheln reicht das Thema am Ende.
 */
async function leseTitel(pfad) {
  const puffer = Buffer.alloc(65536)
  const datei = await import('node:fs/promises').then((m) => m.open(pfad, 'r'))
  try {
    const { bytesRead } = await datei.read(puffer, 0, puffer.length, 0)
    const kopf = puffer.subarray(0, bytesRead).toString('utf8')
    const treffer = kopf.match(/<title>([^<]*)<\/title>/i)
    return treffer ? kuerzeTitel(treffer[1]) : null
  } finally {
    await datei.close()
  }
}

/** Macht aus dem langen Deck-Titel das Thema und loest HTML-Entities auf. */
function kuerzeTitel(roh) {
  const entschluesselt = roh
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
  const teile = entschluesselt.split(/\s[—–-]\s/)
  return (teile.length > 1 ? teile[teile.length - 1] : entschluesselt).trim() || null
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
