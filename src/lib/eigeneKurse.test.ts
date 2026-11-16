// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const {
  KUERZEL_MUSTER,
  dateiStamm,
  kuerzelVorschlag,
  kursnamePruefen,
  liefername,
  pdfPruefen,
  tagDateienVorbereiten,
  tagPfade,
  titelPruefen,
} = await import('./eigeneKurse')

describe('Kürzel für neue Kurse', () => {
  it('lesbar aus dem Namen, mit Zufall, immer im erlaubten Format', () => {
    expect(kuerzelVorschlag('Brandschutz in der Verwaltung', 'abcde')).toBe('brandschutz-in-der-verwa-abcde')
    expect(kuerzelVorschlag('Größe & Übergabe', 'k3m9x')).toBe('groesse-uebergabe-k3m9x')
    expect(kuerzelVorschlag('Café Señor', 'aaaaa')).toBe('cafe-senor-aaaaa')
    expect(kuerzelVorschlag('***', 'aaaaa')).toBe('kurs-aaaaa')
    expect(kuerzelVorschlag('  -Test-  ', 'aaaaa')).toBe('test-aaaaa')
    for (const name of ['Brandschutz', 'Ä', '', '--', 'x'.repeat(200), 'Tag 1 / Teil 2', '日本語']) {
      const k = kuerzelVorschlag(name)
      expect(k, name).toMatch(KUERZEL_MUSTER)
      // Kürzel von Nicht-Admins müssen so enden, sonst lehnt die Datenbank sie ab (Migration 20261116100000)
      expect(k, name).toMatch(/-[a-z2-9]{5}$/)
      expect(k.length).toBeLessThanOrEqual(40)
    }
  })

  it('zwei Vorschläge für denselben Namen unterscheiden sich (Zufall)', () => {
    const viele = new Set(Array.from({ length: 50 }, () => kuerzelVorschlag('Kurs')))
    expect(viele.size).toBeGreaterThan(45)
  })
})

describe('Namen und Titel', () => {
  it('Kursname wie die Datenbank', () => {
    expect(kursnamePruefen('Brandschutz')).toBeNull()
    expect(kursnamePruefen('  H&G   kompakt ')).toBeNull()
    expect(kursnamePruefen('X')).toMatch(/2 bis 80/)
    expect(kursnamePruefen('x'.repeat(81))).toMatch(/2 bis 80/)
    expect(kursnamePruefen('Kurs <b>')).toMatch(/spitzen Klammern/)
    expect(kursnamePruefen('Kurs\u200bname')).toMatch(/unsichtbaren/)
    expect(kursnamePruefen('Kurs \u202ename')).toMatch(/unsichtbaren/)
  })

  it('Tagestitel', () => {
    expect(titelPruefen('Grundlagen')).toBeNull()
    expect(titelPruefen('   ')).toMatch(/Titel eingeben/)
    expect(titelPruefen('a'.repeat(121))).toMatch(/höchstens/)
    expect(titelPruefen('a<b')).toMatch(/spitzen/)
  })
})

describe('Dateien eines Tages', () => {
  it('Namen und Pfade je Art', () => {
    expect(dateiStamm('kurstag', 3)).toBe('Tag3')
    expect(dateiStamm('projekttag', 1)).toBe('Projekttag1')
    expect(dateiStamm('pruefung', 1)).toBe('Pruefung1')
    expect(tagPfade('brand-abcde', 'kurstag', 2)).toEqual({
      trainer: 'brand-abcde/trainer/Tag2.html',
      teilnehmer: 'brand-abcde/teilnehmer/Tag2.html',
      pdf: 'brand-abcde/pdf/Tag2.pdf',
      quellen: 'brand-abcde/quellen/Tag2.zip',
    })
  })

  it('Liefername ohne Zeichen, die Windows verbietet', () => {
    expect(liefername('kurstag', 3, 'Brandschutz: Teil 1/2')).toBe('Tag 3 - Brandschutz Teil 1 2')
    expect(liefername('projekttag', 1, 'Fall „Müller“?')).toBe('Projekttag 1 - Fall „Müller“')
    expect(liefername('pruefung', 1, 'Abschluss...')).toBe('Abschlussprüfung - Abschluss')
    expect(liefername('kurstag', 2, '  ')).toBe('Tag 2')
  })

  it('PDF erkennen', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    expect(pdfPruefen('a.pdf', 10, pdf)).toBeNull()
    expect(pdfPruefen('a.txt', 10, pdf)).toMatch(/PDF-Datei/)
    expect(pdfPruefen('a.pdf', 31 * 1024 * 1024, pdf)).toMatch(/größer/)
    expect(pdfPruefen('a.pdf', 10, new Uint8Array([0x50, 0x4b, 3, 4]))).toMatch(/kein gültiges PDF/)
  })
})

describe('Vor dem Hochladen: Teilnehmerfassung', () => {
  const zip = () => new File([new Uint8Array([0x50, 0x4b, 3, 4, 0])], 'Tag1.zip')
  const deck = (folie: string, ende = '</body></html>') =>
    new File(
      [
        `<!doctype html><html><body><button onclick="openCockpit()">🖥 Trainer-Cockpit öffnen</button>` +
          `<div id="stage">${folie}</div><script>function go(n){}</script>${ende}`,
      ],
      'Tag1.html',
    )
  const folie =
    '<section class="slide" data-notes="Nur für den Trainer." data-aktion="Fragen" data-bruecke="Weiter geht es."><h2 class="folientitel">A</h2></section>'

  it('macht aus einem Deck mit Notizen, Aktionen und Brücken eine saubere Teilnehmerfassung', async () => {
    const { teilnehmer } = await tagDateienVorbereiten({ deck: deck(folie), quellen: zip(), pdf: null })
    const html = await teilnehmer.text()
    expect(html).not.toMatch(/data-notes|data-aktion|data-bruecke|Nur für den Trainer|openCockpit\(\)"/)
    expect(html).toContain('touchend')
    expect(html).toContain('folientitel')
  })

  it('lehnt ab, was nicht passt: keine Folien, kein Zip, kein PDF, keine saubere Teilnehmerfassung', async () => {
    await expect(tagDateienVorbereiten({ deck: deck(''), quellen: zip(), pdf: null })).rejects.toThrow(/keine Folien/)
    await expect(
      tagDateienVorbereiten({ deck: deck(folie), quellen: new File(['kein zip'], 'Tag1.zip'), pdf: null }),
    ).rejects.toThrow(/kein gültiges Zip/)
    await expect(
      tagDateienVorbereiten({ deck: deck(folie), quellen: zip(), pdf: new File(['x'], 'a.pdf') }),
    ).rejects.toThrow(/kein gültiges PDF/)
    // ohne </body> keine Navigation: die Fassung wäre für Teilnehmer am Telefon unbrauchbar
    await expect(tagDateienVorbereiten({ deck: deck(folie, ''), quellen: zip(), pdf: null })).rejects.toThrow(
      /Wischnavigation fehlt/,
    )
  })
})
