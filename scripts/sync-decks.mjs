/**
 * Laedt geaenderte Trainer-Decks aus den lokalen Kursordnern in den privaten
 * Supabase-Bucket "decks" und haelt die Tabelle public.kurstage aktuell.
 *
 * Aufruf:  npm run sync:decks                 (alle Kurse aus kurse.config.json)
 *          npm run sync:decks -- --kurs hg    (nur ein Kurs)
 *          npm run sync:decks -- --dry        (nur zeigen, was passieren wuerde)
 *          npm run sync:decks -- --force      (auch unveraenderte Decks neu laden)
 *
 * Welche Kurse es gibt, steht in kurse.config.json; wo sie liegen, sagt
 * KURS_WURZEL in der .env. So enthaelt das oeffentliche Repo keine Pfade von
 * Nikos Rechner.
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
 *
 * Teilnehmerfassung und PDF (Baustein 2): Hochgeladen wird nur, was Niko
 * tatsaechlich ausgibt. Massgeblich ist der Lieferordner "2. Slides" (Feld
 * "lieferung" in kurse.config.json): Liegt dort dieselbe Datei (gleiche
 * Pruefsumme), gilt sie als ausgegeben und bekommt ihren Liefernamen. Ordner,
 * die mit "_" beginnen ("_voll (nicht ausgegeben)"), zaehlen nicht. Liegt eine
 * Datei nicht (mehr) dort, verschwindet ihr Download-Knopf; die Datei im
 * Bucket bleibt liegen.
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
const KURS_WURZEL = env.KURS_WURZEL
const SITZUNGSDATEI = join(WURZEL, '.sync-session.json')
const BUCKET = 'decks'
const TROCKEN = process.argv.includes('--dry')
// laedt auch unveraenderte Decks neu; noetig, wenn sich nicht die Datei, sondern
// das aendert, was wir aus ihr herauslesen
const ERZWINGEN = process.argv.includes('--force')
const NUR_KURS = argWert('--kurs')

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Fehlt in .env: VITE_SUPABASE_URL und/oder VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}
if (!EMAIL) {
  console.error('Fehlt in .env: SUPABASE_EMAIL (die Adresse deines Supabase-Kontos)')
  process.exit(1)
}
if (!KURS_WURZEL || !existsSync(KURS_WURZEL)) {
  console.error(`KURS_WURZEL nicht gefunden: ${KURS_WURZEL}`)
  process.exit(1)
}

const alleKurse = JSON.parse(readFileSync(join(WURZEL, 'kurse.config.json'), 'utf8'))
const kurse = NUR_KURS ? alleKurse.filter((k) => k.slug === NUR_KURS) : alleKurse
if (kurse.length === 0) {
  console.error(
    NUR_KURS
      ? `Kurs "${NUR_KURS}" steht nicht in kurse.config.json.`
      : 'kurse.config.json enthaelt keine Kurse.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Nach einer Netzwerkanfrage kein process.exit(): Node bricht unter Windows sonst
// mit "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" ab. Fehler setzen
// deshalb nur den Exit-Code.
if (await anmelden()) {
  for (const kurs of kurse) {
    await synchronisiereKurs(kurs)
  }
}

/** Gleicht einen Kurs ab: Decks suchen, Neues hochladen, Tabelle nachziehen. */
async function synchronisiereKurs(kurs) {
  const ordner = join(KURS_WURZEL, kurs.ordner)
  console.log(`\n[${kurs.slug}] ${kurs.name}`)

  if (!existsSync(ordner)) {
    console.log(`  Ordner fehlt (${ordner}), uebersprungen.`)
    return
  }

  const decks = await findeDecks(join(ordner, 'segmente'))
  if (decks.length === 0) {
    console.log('  Noch keine gebauten Decks gefunden, uebersprungen.')
    return
  }
  console.log(`  ${decks.length} Trainer-Decks gefunden.`)

  const lieferung = await lieferIndex(kurs)
  console.log(
    lieferung
      ? `  Lieferordner: ${lieferung.anzahl} Dateien (ausgegeben ist, was dort liegt).`
      : '  Kein Lieferordner: keine Teilnehmerfassungen und PDFs zum Herunterladen.',
  )

  const kursId = await kursAnlegen(kurs)
  if (!kursId) return

  // Nur Kurstage: Projekttage tragen dieselben Nummern (Projekttag 1 neben
  // Kurstag 1) und wuerden die Pruefsummen sonst ueberschreiben.
  const { data: bestand } = await supabase
    .from('kurstage')
    .select('nummer, deck_hash, teilnehmer_hash, pdf_hash')
    .eq('kurs_id', kursId)
    .eq('art', 'kurstag')

  const bekannt = new Map((bestand ?? []).map((z) => [z.nummer, z]))
  const zahl = { trainer: 0, teilnehmer: 0, pdf: 0, unveraendert: 0, ausgegeben: 0 }

  for (const deck of decks.sort((a, b) => a.nummer - b.nummer)) {
    const alt = bekannt.get(deck.nummer) ?? {}
    const trainer = await lesen(deck.pfad)
    const teilnehmer = deck.teilnehmerPfad ? await lesen(deck.teilnehmerPfad) : null
    const pdf = deck.pdfPfad ? await lesen(deck.pdfPfad) : null

    // Ausgegeben ist, was im Lieferordner liegt; von dort kommt auch der Name.
    const nameTeilnehmer = teilnehmer && lieferung ? await lieferung.finde(teilnehmer) : null
    const namePdf = pdf && lieferung ? await lieferung.finde(pdf) : null
    const nameTrainer = lieferung ? await lieferung.finde(trainer) : null
    const liefername = nameTeilnehmer ?? namePdf ?? nameTrainer

    // Die Dateien laden wir nur bei echter Aenderung; Titel, Segmentname und
    // Liefername schreiben wir immer, die koennen sich auch ohne neue Datei aendern.
    const schritte = [
      {
        art: 'Trainer',
        datei: trainer,
        ziel: `${kurs.slug}/trainer/${basename(deck.pfad)}`,
        neu: ERZWINGEN || alt.deck_hash !== trainer.hash,
        typ: 'text/html; charset=utf-8',
      },
      nameTeilnehmer && {
        art: 'Teilnehmer',
        datei: teilnehmer,
        ziel: `${kurs.slug}/teilnehmer/${basename(deck.teilnehmerPfad)}`,
        neu: ERZWINGEN || alt.teilnehmer_hash !== teilnehmer.hash,
        typ: 'text/html; charset=utf-8',
      },
      namePdf && {
        art: 'PDF',
        datei: pdf,
        ziel: `${kurs.slug}/pdf/${basename(deck.pdfPfad)}`,
        neu: ERZWINGEN || alt.pdf_hash !== pdf.hash,
        typ: 'application/pdf',
      },
    ].filter(Boolean)

    for (const s of schritte.filter((s) => s.neu)) {
      console.log(`  Tag ${deck.nummer}: ${s.art} geaendert -> ${s.ziel} (${mb(s.datei.inhalt.length)})`)
    }
    if (nameTeilnehmer || namePdf) zahl.ausgegeben++

    if (TROCKEN) {
      for (const s of schritte) s.neu ? zahl[s.art.toLowerCase()]++ : zahl.unveraendert++
      continue
    }

    let fehler = false
    for (const s of schritte.filter((s) => s.neu)) {
      // cacheControl '0': Ohne Angabe liefert Supabase die Datei mit
      // "max-age=3600" aus, und Browser wie CDN halten ein neues Deck dann bis zu
      // einer Stunde zurueck. Niko sah am 04.10.2026 nach einem Update noch die
      // alte Fassung. Die App laedt zusaetzlich mit cache: 'no-store'.
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(s.ziel, s.datei.inhalt, { contentType: s.typ, upsert: true, cacheControl: '0' })
      if (error) {
        console.error(`  Fehler beim Upload (${s.art}) von Tag ${deck.nummer}: ${error.message}`)
        process.exitCode = 1
        fehler = true
      }
    }
    if (fehler) continue

    const tn = schritte.find((s) => s.art === 'Teilnehmer')
    const pd = schritte.find((s) => s.art === 'PDF')
    const zeile = {
      kurs_id: kursId,
      // Projekttage und Pruefung kommen aus dem Trainertagebuch-Import und
      // haben kein Deck; der Sync schreibt ausschliesslich Kurstage.
      art: 'kurstag',
      nummer: deck.nummer,
      segment: deck.segment,
      segment_titel: deck.segmentTitel,
      titel: deck.titel,
      deck_pfad: schritte[0].ziel,
      deck_hash: trainer.hash,
      deck_groesse: trainer.inhalt.length,
      liefername,
      // Nicht (mehr) ausgegeben: Feld leer, der Download-Knopf verschwindet.
      teilnehmer_pfad: tn?.ziel ?? null,
      teilnehmer_hash: tn?.datei.hash ?? null,
      teilnehmer_groesse: tn?.datei.inhalt.length ?? null,
      pdf_pfad: pd?.ziel ?? null,
      pdf_hash: pd?.datei.hash ?? null,
      pdf_groesse: pd?.datei.inhalt.length ?? null,
    }
    // Das Stand-Datum nur anfassen, wenn das Trainer-Deck wirklich neu ist.
    if (schritte[0].neu) zeile.deck_aktualisiert_am = new Date().toISOString()

    const { error: schreibFehler } = await supabase
      .from('kurstage')
      .upsert(zeile, { onConflict: 'kurs_id,art,nummer' })

    if (schreibFehler) {
      console.error(`  Fehler beim Eintrag von Tag ${deck.nummer}: ${schreibFehler.message}`)
      process.exitCode = 1
      continue
    }
    for (const s of schritte) s.neu ? zahl[s.art.toLowerCase()]++ : zahl.unveraendert++
  }

  const bilanz =
    `${zahl.trainer} Trainer-Deck(s), ${zahl.teilnehmer} Teilnehmerfassung(en), ${zahl.pdf} PDF(s)` +
    ` ${TROCKEN ? 'waeren geladen worden' : 'geladen'}, ${zahl.unveraendert} Datei(en) unveraendert;` +
    ` ${zahl.ausgegeben} von ${decks.length} Tagen ausgegeben.`
  console.log(TROCKEN ? `  Probelauf: ${bilanz}` : `  Fertig: ${bilanz}`)
}

/**
 * Legt den Kurs an, falls er noch fehlt, und gibt seine Id zurueck. Angelegt
 * wird erst, wenn es auch Decks gibt; so taucht im Dashboard kein leerer
 * Reiter fuer einen Kurs auf, der noch gar nicht gebaut ist.
 */
async function kursAnlegen(kurs) {
  if (TROCKEN) {
    const { data } = await supabase.from('kurse').select('id').eq('slug', kurs.slug).maybeSingle()
    if (!data) console.log('  (Probelauf: der Kurs wuerde neu angelegt)')
    return data?.id ?? null
  }

  const { data, error } = await supabase
    .from('kurse')
    .upsert({ slug: kurs.slug, name: kurs.name }, { onConflict: 'slug' })
    .select('id')
    .single()

  if (error || !data) {
    console.error(`  Kurs konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
    process.exitCode = 1
    return null
  }
  return data.id
}

// ---------------------------------------------------------------------------

/** Liest den Wert eines Aufrufparameters, etwa --kurs hg. */
function argWert(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : null
}

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
      return true
    }
    console.log(
      'Gespeicherte Sitzung ist abgelaufen oder wurde abgemeldet, bitte neu anmelden.',
    )
  }

  const passwort =
    process.env.SUPABASE_PASSWORT ?? (await frageVerdeckt(`Passwort fuer ${EMAIL}: `))
  if (passwort === null) {
    process.exitCode = 1
    return false
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: passwort,
  })
  if (error || !data.session) {
    console.error(`Anmeldung fehlgeschlagen: ${error?.message ?? 'unbekannter Fehler'}`)
    process.exitCode = 1
    return false
  }
  await merkeSitzung(data.session)
  console.log(`Angemeldet als ${data.session.user.email}.`)
  return true
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
    return Promise.resolve(null)
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
 * Trainer-Fassung; die Teilnehmerunterlagen laufen weiter ueber Google Drive.
 */
async function findeDecks(segmenteOrdner) {
  if (!existsSync(segmenteOrdner)) return []
  const gefunden = []
  for (const segment of await readdir(segmenteOrdner)) {
    const distOrdner = join(segmenteOrdner, segment, 'dist')
    if (!existsSync(distOrdner)) continue

    for (const datei of await readdir(distOrdner)) {
      const voll = join(distOrdner, datei)
      if (!(await stat(voll)).isFile()) continue
      const treffer = datei.match(/^Tag(\d+)_Segment(\d+)\.html$/i)
      if (!treffer) continue
      // Teilnehmerfassung und PDF liegen daneben (teilnehmer.py, pdf.py)
      const teilnehmerPfad = join(distOrdner, 'teilnehmer', datei)
      const pdfPfad = join(distOrdner, 'teilnehmer', 'pdf', datei.replace(/\.html$/i, '.pdf'))
      gefunden.push({
        pfad: voll,
        nummer: Number(treffer[1]),
        segment: Number(treffer[2]),
        teilnehmerPfad: existsSync(teilnehmerPfad) ? teilnehmerPfad : null,
        pdfPfad: existsSync(pdfPfad) ? pdfPfad : null,
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

/** Liest eine Datei und berechnet ihre Pruefsumme. */
async function lesen(pfad) {
  const inhalt = await readFile(pfad)
  return { inhalt, hash: createHash('sha256').update(inhalt).digest('hex') }
}

/**
 * Verzeichnis des Lieferordners ("2. Slides"): welche Dateien Niko tatsaechlich
 * ausgibt und unter welchem Namen. Gesucht wird nach gleicher Pruefsumme; damit
 * nicht jede Datei gelesen werden muss, nur unter Dateien gleicher Groesse.
 * Ordner, die mit "_" beginnen ("_voll (nicht ausgegeben)"), bleiben aussen vor.
 * Ohne Feld "lieferung" in kurse.config.json oder ohne den Ordner: null.
 */
async function lieferIndex(kurs) {
  if (!kurs.lieferung) return null
  const wurzel = join(KURS_WURZEL, kurs.lieferung)
  if (!existsSync(wurzel)) return null

  const nachGroesse = new Map()
  let anzahl = 0
  async function sammeln(ordner) {
    for (const eintrag of await readdir(ordner, { withFileTypes: true })) {
      const voll = join(ordner, eintrag.name)
      if (eintrag.isDirectory()) {
        if (!eintrag.name.startsWith('_')) await sammeln(voll)
        continue
      }
      if (!/\.(html|pdf)$/i.test(eintrag.name)) continue
      const { size } = await stat(voll)
      if (!nachGroesse.has(size)) nachGroesse.set(size, [])
      nachGroesse.get(size).push(voll)
      anzahl++
    }
  }
  await sammeln(wurzel)

  const pruefsummen = new Map()
  return {
    anzahl,
    /** Liefername (ohne Endung) einer gelesenen Datei, oder null, wenn sie nicht ausgegeben ist. */
    async finde({ inhalt, hash }) {
      for (const kandidat of nachGroesse.get(inhalt.length) ?? []) {
        if (!pruefsummen.has(kandidat)) pruefsummen.set(kandidat, (await lesen(kandidat)).hash)
        if (pruefsummen.get(kandidat) === hash) return basename(kandidat).replace(/\.(html|pdf)$/i, '')
      }
      return null
    },
  }
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
