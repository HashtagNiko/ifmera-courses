/**
 * Laedt geaenderte Trainer-Decks aus dem lokalen Kursordner in den privaten
 * Supabase-Bucket "decks" und haelt die Tabelle public.kurstage aktuell.
 *
 * Aufruf:  npm run sync:decks            (alle Kurstage pruefen)
 *          npm run sync:decks -- --dry   (nur zeigen, was passieren wuerde)
 *
 * Angemeldet wird sich mit dem normalen Supabase-Konto, nicht mit einem
 * service_role-Key: der wuerde alle Sicherheitsregeln des Projekts umgehen,
 * also auch die der Pruefungsdaten. Beim ersten Lauf fragt das Skript einmal
 * nach dem Passwort und legt die Sitzung in .sync-session.json ab; danach
 * laeuft es ohne Rueckfrage. Hochladen darf nur, wer in kurs_zugriff steht,
 * das setzen die RLS-Policies durch.
 *
 * Verglichen wird per sha256: hochgeladen wird nur, was sich seit dem letzten
 * Lauf wirklich geaendert hat. Die Quelle bleibt der lokale Ordner, damit
 * OneDrive und Tool nicht auseinanderlaufen.
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile, open } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = ladeEnv(join(WURZEL, '.env'))

const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const EMAIL = env.SUPABASE_EMAIL
const QUELLE = env.DECK_QUELLE
const SITZUNGSDATEI = join(WURZEL, '.sync-session.json')
const KURS_SLUG = 'weg'
const BUCKET = 'decks'
const TROCKEN = process.argv.includes('--dry')
// laedt auch unveraenderte Decks neu; noetig, wenn sich nicht die Datei, sondern
// das aendert, was wir aus ihr herauslesen
const ERZWINGEN = process.argv.includes('--force')

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Fehlt in .env: VITE_SUPABASE_URL und/oder VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}
if (!EMAIL) {
  console.error('Fehlt in .env: SUPABASE_EMAIL (die Adresse deines Supabase-Kontos)')
  process.exit(1)
}
if (!QUELLE || !existsSync(QUELLE)) {
  console.error(`DECK_QUELLE nicht gefunden: ${QUELLE}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

await anmelden()

const { data: kurs, error: kursFehler } = await supabase
  .from('kurse')
  .select('id')
  .eq('slug', KURS_SLUG)
  .single()

if (kursFehler || !kurs) {
  console.error(
    `Kurs "${KURS_SLUG}" nicht lesbar. Ist die Migration eingespielt und dein ` +
      'Konto in kurs_zugriff eingetragen?',
  )
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

  const zielPfad = `${KURS_SLUG}/trainer/${basename(deck.pfad)}`
  // Die Datei laden wir nur bei echter Aenderung; Titel und Segmentname
  // schreiben wir immer, die koennen sich auch ohne neue Datei aendern.
  const dateiNeu = ERZWINGEN || bekannt.get(deck.nummer) !== hash

  if (dateiNeu) {
    console.log(`  Tag ${deck.nummer}: geaendert -> ${zielPfad} (${mb(inhalt.length)})`)
  }

  if (TROCKEN) {
    dateiNeu ? geladen++ : uebersprungen++
    continue
  }

  if (dateiNeu) {
    const { error: uploadFehler } = await supabase.storage
      .from(BUCKET)
      .upload(zielPfad, inhalt, { contentType: 'text/html; charset=utf-8', upsert: true })

    if (uploadFehler) {
      console.error(`  Fehler beim Upload von Tag ${deck.nummer}: ${uploadFehler.message}`)
      process.exitCode = 1
      continue
    }
  }

  const zeile = {
    kurs_id: kurs.id,
    nummer: deck.nummer,
    segment: deck.segment,
    segment_titel: deck.segmentTitel,
    titel: deck.titel,
    deck_pfad: zielPfad,
    deck_hash: hash,
    deck_groesse: inhalt.length,
  }
  // Das Stand-Datum nur anfassen, wenn die Datei wirklich neu ist.
  if (dateiNeu) zeile.deck_aktualisiert_am = new Date().toISOString()

  const { error: schreibFehler } = await supabase
    .from('kurstage')
    .upsert(zeile, { onConflict: 'kurs_id,nummer' })

  if (schreibFehler) {
    console.error(`  Fehler beim Eintrag von Tag ${deck.nummer}: ${schreibFehler.message}`)
    process.exitCode = 1
    continue
  }
  dateiNeu ? geladen++ : uebersprungen++
}

console.log(
  TROCKEN
    ? `Probelauf: ${geladen} Deck(s) waeren geladen worden, ${uebersprungen} unveraendert.`
    : `Fertig: ${geladen} Deck(s) geladen, ${uebersprungen} unveraendert.`,
)

// ---------------------------------------------------------------------------

/**
 * Meldet sich an: zuerst mit der gespeicherten Sitzung, sonst per Passwort.
 * Das Passwort landet nirgends auf der Platte, gespeichert wird nur das
 * erneuerbare Token.
 */
async function anmelden() {
  if (existsSync(SITZUNGSDATEI)) {
    const gespeichert = JSON.parse(readFileSync(SITZUNGSDATEI, 'utf8'))
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: gespeichert.refresh_token,
    })
    if (!error && data.session) {
      await merkeSitzung(data.session)
      console.log(`Angemeldet als ${data.session.user.email} (gespeicherte Sitzung).`)
      return
    }
    console.log('Gespeicherte Sitzung ist abgelaufen, bitte neu anmelden.')
  }

  const passwort =
    process.env.SUPABASE_PASSWORT ?? (await frageVerdeckt(`Passwort fuer ${EMAIL}: `))
  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: passwort,
  })
  if (error || !data.session) {
    console.error(`Anmeldung fehlgeschlagen: ${error?.message ?? 'unbekannter Fehler'}`)
    process.exit(1)
  }
  await merkeSitzung(data.session)
  console.log(`Angemeldet als ${data.session.user.email}.`)
}

/** Legt nur das Refresh-Token ab, damit der naechste Lauf nicht wieder fragt. */
async function merkeSitzung(session) {
  await writeFile(
    SITZUNGSDATEI,
    JSON.stringify({ refresh_token: session.refresh_token }, null, 2),
    'utf8',
  )
}

/** Fragt eine Eingabe ab, ohne sie im Terminal anzuzeigen. */
function frageVerdeckt(frage) {
  if (!process.stdin.isTTY) {
    console.error(
      'Kein Terminal fuer die Passworteingabe. Einmal "npm run sync:decks" in einer ' +
        'normalen Konsole starten, danach genuegt die gespeicherte Sitzung.',
    )
    process.exit(1)
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    process.stdout.write(frage)
    rl._writeToOutput = () => {}
    rl.question('', (antwort) => {
      rl.close()
      process.stdout.write('\n')
      resolve(antwort)
    })
  })
}

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
 * Trainer-Fassung. Die Bucket-Struktur (weg/trainer/...) laesst Platz dafuer.
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
        ...(await leseTitel(voll)),
      })
    }
  }
  return gefunden
}

/**
 * Holt den <title> aus dem Deck; dafuer reicht der Anfang der Datei.
 * Die Decks tragen dort die lange Form
 * "ifmera · Rechtliche Grundlagen · Tag 3 von 6 — Die Eigentuemerversammlung",
 * also Marke, Segmentname, Zaehlung und Thema. Wir holen daraus den
 * Segmentnamen fuer die Ueberschrift und das Thema fuer die Kachel.
 */
async function leseTitel(pfad) {
  const puffer = Buffer.alloc(65536)
  const datei = await open(pfad, 'r')
  try {
    const { bytesRead } = await datei.read(puffer, 0, puffer.length, 0)
    const kopf = puffer.subarray(0, bytesRead).toString('utf8')
    const treffer = kopf.match(/<title>([^<]*)<\/title>/i)
    return treffer ? zerlegeTitel(treffer[1]) : { titel: null, segmentTitel: null }
  } finally {
    await datei.close()
  }
}

/** Zerlegt den Deck-Titel in Segmentname und Thema, loest HTML-Entities auf. */
function zerlegeTitel(roh) {
  const entschluesselt = roh
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

  // Der mittlere Abschnitt ist der Segmentname; ohne diesen Aufbau bleibt er leer.
  const abschnitte = entschluesselt.split('·').map((s) => s.trim())
  const segmentTitel = abschnitte.length >= 3 ? abschnitte[1] : null

  // Das Thema steht hinter dem letzten Gedankenstrich.
  const teile = entschluesselt.split(/\s[—–-]\s/)
  const titel = (teile.length > 1 ? teile[teile.length - 1] : entschluesselt).trim() || null

  return { titel, segmentTitel }
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
