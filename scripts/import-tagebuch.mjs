/**
 * Liest die "Themenuebersicht Trainertagebuch" eines Kurses und legt daraus die
 * Kurstage an, inklusive der Tage ohne Deck (Projekttage, Abschlusspruefung).
 *
 * Aufruf:  npm run import:tagebuch                  (alle Kurse mit tagebuch-Eintrag)
 *          npm run import:tagebuch -- --kurs weg
 *          npm run import:tagebuch -- --dry
 *
 * Die Themen werden nicht abgetippt, sondern aus der Word-Datei gelesen: eine
 * zweite Liste liefe sofort auseinander. Aufbau der Datei je Tag:
 *
 *     Kurstag 5   Die Eigentuemerversammlung   686 Zeichen
 *     – Einberufung, Frist, Form
 *     – ...
 *
 * Die Zeichenzahl stammt aus der Vorlage; das Trainertagebuch hat je Tag ein
 * begrenztes Feld. Sie wird mitgefuehrt, damit im Tool sichtbar ist, wie lang
 * der Text ist, den man herauskopiert.
 */
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = ladeEnv(join(WURZEL, '.env'))
const SITZUNGSDATEI = join(WURZEL, '.sync-session.json')
const TROCKEN = process.argv.includes('--dry')
const NUR_KURS = argWert('--kurs')

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY || !env.KURS_WURZEL) {
  console.error('Fehlt in .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY oder KURS_WURZEL')
  process.exit(1)
}
if (!existsSync(SITZUNGSDATEI)) {
  console.error('Keine gespeicherte Sitzung. Erst einmal "npm run sync:decks" ausfuehren.')
  process.exit(1)
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { error: anmeldeFehler } = await supabase.auth.refreshSession({
  refresh_token: JSON.parse(readFileSync(SITZUNGSDATEI, 'utf8')).refresh_token,
})
if (anmeldeFehler) {
  console.error(`Anmeldung fehlgeschlagen: ${anmeldeFehler.message}`)
  process.exit(1)
}

const alleKurse = JSON.parse(readFileSync(join(WURZEL, 'kurse.config.json'), 'utf8'))
const kurse = (NUR_KURS ? alleKurse.filter((k) => k.slug === NUR_KURS) : alleKurse).filter(
  (k) => k.tagebuch,
)

if (kurse.length === 0) {
  console.error('Kein Kurs mit einem "tagebuch"-Eintrag in kurse.config.json gefunden.')
  process.exit(1)
}

for (const kurs of kurse) {
  await importiere(kurs)
}

async function importiere(kurs) {
  const datei = join(env.KURS_WURZEL, kurs.tagebuch)
  console.log(`\n[${kurs.slug}] ${kurs.name}`)

  if (!existsSync(datei)) {
    console.log(`  Datei fehlt: ${datei}`)
    return
  }

  const tage = zerlegeTagebuch(await leseAbsaetze(datei))
  if (tage.length === 0) {
    console.log('  Keine Tage erkannt. Aufbau der Datei geaendert?')
    process.exitCode = 1
    return
  }

  const zusammenfassung = tage.reduce((acc, t) => {
    acc[t.art] = (acc[t.art] ?? 0) + 1
    return acc
  }, {})
  console.log(
    `  ${tage.length} Tage erkannt: ` +
      Object.entries(zusammenfassung)
        .map(([art, n]) => `${n} ${art}`)
        .join(', '),
  )

  const { data: kursZeile } = await supabase
    .from('kurse')
    .select('id')
    .eq('slug', kurs.slug)
    .maybeSingle()

  if (!kursZeile) {
    console.log('  Kurs steht noch nicht in der Datenbank. Erst "npm run sync:decks".')
    process.exitCode = 1
    return
  }

  for (const tag of tage) {
    const kennung = `${tag.art} ${tag.nummer}`
    console.log(`  ${kennung.padEnd(16)} ${tag.titel} (${tag.punkte.length} Punkte)`)
    if (TROCKEN) continue

    const { error } = await supabase.from('kurstage').upsert(
      {
        kurs_id: kursZeile.id,
        art: tag.art,
        nummer: tag.nummer,
        position: tag.position,
        tagebuch_titel: tag.titel,
        tagebuch_text: tag.punkte.join('\n'),
        tagebuch_zeichen: tag.zeichen,
      },
      { onConflict: 'kurs_id,art,nummer' },
    )
    if (error) {
      console.error(`    Fehler: ${error.message}`)
      process.exitCode = 1
    }
  }

  console.log(TROCKEN ? '  Probelauf, nichts geschrieben.' : '  Fertig.')
}

// ---------------------------------------------------------------------------

/** Holt die Absaetze aus einer .docx; das ist ein Zip mit word/document.xml. */
async function leseAbsaetze(pfad) {
  const zip = await JSZip.loadAsync(await readFile(pfad))
  const xml = await zip.file('word/document.xml').async('string')

  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
    .map((absatz) =>
      absatz
        // Tabulatoren trennen Nummer, Titel und Zeichenzahl
        .replace(/<w:tab\/>/g, ' ')
        .match(/<w:t[^>]*>([^<]*)<\/w:t>/g)
        ?.map((t) => t.replace(/<[^>]+>/g, ''))
        .join('') ?? '',
    )
    .map((zeile) => entschluessle(zeile).trim())
    .filter(Boolean)
}

/**
 * Macht aus den Absaetzen eine Liste von Tagen. Ueberschrift beginnt mit
 * "Kurstag" oder "Projekttag", die Themenpunkte darunter mit einem Halbgeviert.
 */
function zerlegeTagebuch(zeilen) {
  const tage = []
  let aktuell = null

  for (const zeile of zeilen) {
    const kopf = zeile.match(/^(Kurstag|Projekttag)\s+(\d+)\s+(.*?)\s+(\d+)\s*Zeichen\s*$/)
    if (kopf) {
      const titel = kopf[3].trim()
      aktuell = {
        art: /Abschlusspr[uü]fung/i.test(titel)
          ? 'pruefung'
          : kopf[1] === 'Projekttag'
            ? 'projekttag'
            : 'kurstag',
        nummer: Number(kopf[2]),
        titel,
        zeichen: Number(kopf[4]),
        position: tage.length + 1,
        punkte: [],
      }
      tage.push(aktuell)
      continue
    }
    if (aktuell && /^[–-]\s/.test(zeile)) {
      aktuell.punkte.push(zeile.replace(/^[–-]\s*/, '').trim())
    }
  }
  return tage
}

function entschluessle(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function argWert(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : null
}

function ladeEnv(pfad) {
  if (!existsSync(pfad)) return {}
  const werte = {}
  for (const zeile of readFileSync(pfad, 'utf8').split(/\r?\n/)) {
    const treffer = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (treffer) werte[treffer[1]] = treffer[2].replace(/^["']|["']$/g, '')
  }
  return werte
}
