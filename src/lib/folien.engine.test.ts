// @vitest-environment node
/**
 * Eigene Notizen im Cockpit, geprueft mit der ECHTEN Engine eines gebauten Decks.
 * Die Decks liegen nicht im Repo; der Test findet sie ueber KURS_WURZEL aus der .env
 * und wird uebersprungen, wenn es den Ordner nicht gibt (etwa auf GitHub).
 * Aufgefallen ist so, dass syncCockpit der Engine an der fehlenden Uhr #tmr abbricht.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { folienLesen, notizenEinsetzen } from './folien'

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
const wurzel = env.match(/^\s*KURS_WURZEL\s*=\s*["']?(.+?)["']?\s*$/m)?.[1]
const dateiname = (pfad: string) => pfad.split(/[\\/]/).pop()
const decks = ['10_WEG-Kurs/segmente/Segment2/dist/Tag5_Segment2.html', '50_H&G-Kurs/segmente/Segment3/dist/Tag8_Segment3.html']
  .map((d) => (wurzel ? join(wurzel, d) : ''))
  .filter((p) => p && existsSync(p))

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(decks.length === 0)('Cockpit mit echter Engine', () => {
for (const pfad of decks) {
  it(`echte Engine: ${dateiname(pfad)}`, async () => {
    const html = readFileSync(pfad, 'utf8')
    ;(globalThis as any).DOMParser = new JSDOM('').window.DOMParser
    const folien = folienLesen(html)
    const mit = notizenEinsetzen(html, [
      { folie_schluessel: folien[0].schluessel, notiz: '**Eigen** Test\n- Punkt', aktion: 'Eigene Aktion' },
    ])
    const fehler: string[] = []
    let engineWirft = ''
    // Fehler der Engine (fehlende Uhr #tmr) still mitschreiben statt in die Konsole
    const leise = new VirtualConsole()
    leise.on('jsdomError', (e) => fehler.push(e.message))
    const dom = new JSDOM(mit, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: leise,
      beforeParse(win: any) {
        win.addEventListener('error', (e: any) => fehler.push(String(e.message)))
        win.open = () => {
          const c = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true })
          const cw: any = c.window
          cw.document.write = (s: string) => { cw.document.documentElement.innerHTML = new JSDOM(s).window.document.documentElement.innerHTML }
          cw.document.close = () => {}
          cw.opener = win
          return cw
        }
      },
    })
    const w: any = dom.window
    await pause(300)
    w.openCockpit()
    await pause(400)
    const cockpitDoc = w.eval('cockpit').document
    const notes = () => cockpitDoc.getElementById('notes')
    const aktion = () => cockpitDoc.getElementById('aktion')

    // Die Folien der Engine sind genau die, die folienLesen gelesen hat (gleiche Reihenfolge)
    expect(w.eval('allSlides.length')).toBe(folien.length)
    const titelEngine: string[] = w.eval('allSlides.map(titleOf)')
    expect(titelEngine.map((t) => t.replace(/\s+/g, ' ').trim() || 'Folie')).toEqual(folien.map((f) => f.titel))

    // Folie 1: eigene Notiz, formatiert; der bekannte Engine-Fehler wird weitergegeben
    expect(() => w.eval('syncCockpit()')).toThrow(/textContent/)
    expect(notes().innerHTML).toContain('<b>Eigen</b> Test')
    expect(notes().innerHTML).toContain('<li>Punkt</li>')
    expect(aktion().innerHTML).toBe('Eigene Aktion')

    // naechste Folie: Original
    try { w.eval('goto(1)') } catch (e) { engineWirft = String(e) }
    await pause(50)
    expect(notes().textContent).toBe(folien[1].notiz)
    expect(cockpitDoc.getElementById('ifmEigen').style.display).toBe('none')

    // zurueck, Schalter: Original
    try { w.eval('goto(0)') } catch (e) { engineWirft = String(e) }
    await pause(50)
    expect(notes().innerHTML).toContain('<b>Eigen</b>')
    const schalter = cockpitDoc.getElementById('ifmOriginal')
    schalter.checked = true
    schalter.dispatchEvent(new w.Event('change'))
    expect(notes().textContent).toBe(folien[0].notiz)

    console.log(dateiname(pfad), 'ok; Engine-Fehler (bekannt):', fehler.length, engineWirft ? '(weitergegeben)' : '')
  }, 30000)

  it(`echte Engine, Kann-Folien ausgeblendet: ${dateiname(pfad)}`, async () => {
    const html = readFileSync(pfad, 'utf8')
    ;(globalThis as any).DOMParser = new JSDOM('').window.DOMParser
    const folien = folienLesen(html)
    // eine Pflichtfolie, vor der mindestens eine Kann-Folie liegt
    const ziel = folien.findIndex((f, i) => !f.kann && folien.slice(0, i).some((v) => v.kann))
    if (ziel === -1) return // Deck ohne Kann-Folien: nichts zu prüfen
    const mit = notizenEinsetzen(html, [{ folie_schluessel: folien[ziel].schluessel, notiz: 'Nach Kann', aktion: '' }])
    const leise = new VirtualConsole()
    const dom = new JSDOM(mit, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: leise,
      beforeParse(win: any) {
        win.open = () => {
          const cw: any = new JSDOM('<!doctype html><html><head></head><body></body></html>', { virtualConsole: leise }).window
          cw.document.write = (s: string) => { cw.document.documentElement.innerHTML = new JSDOM(s).window.document.documentElement.innerHTML }
          cw.document.close = () => {}
          cw.opener = win
          return cw
        }
      },
    })
    const w: any = dom.window
    await pause(300)
    w.openCockpit()
    await pause(400)
    try { w.eval('setKann(false)') } catch { /* bekannter Engine-Fehler */ }
    const position = w.eval(`activeSlides().indexOf(allSlides[${ziel}])`)
    expect(position).toBeGreaterThanOrEqual(0)
    expect(position).toBeLessThan(ziel) // Kann-Folien davor sind ausgeblendet
    try { w.eval(`goto(${position})`) } catch { /* bekannter Engine-Fehler */ }
    await pause(50)
    expect(w.eval('cockpit').document.getElementById('notes').innerHTML).toBe('Nach Kann')
  }, 30000)
}
})
