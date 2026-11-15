// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import HilfeKnopf, { SEITEN, SEITENHILFE, SEITENTITEL, seiteAus } from './Hilfe'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('seiteAus', () => {
  it('erkennt die Seite an der Adresse', () => {
    expect(seiteAus('/kurstage')).toBe('kurstage')
    expect(seiteAus('/fassungen/123')).toBe('fassungen')
    expect(seiteAus('/notizen/abc')).toBe('notizen')
    expect(seiteAus('/profil')).toBe('profil')
    expect(seiteAus('/anleitung')).toBeNull()
    expect(seiteAus('/')).toBeNull()
  })

  it('hat zu jeder Seite Titel und Hilfe', () => {
    for (const s of SEITEN) {
      expect(SEITENTITEL[s]).toBeTruthy()
      expect(SEITENHILFE[s]).toBeTruthy()
    }
  })
})

describe('HilfeKnopf', () => {
  let root: Root
  let wurzel: HTMLDivElement

  async function zeigen(pfad: string) {
    wurzel = document.createElement('div')
    document.body.appendChild(wurzel)
    root = createRoot(wurzel)
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [pfad] }, createElement(HilfeKnopf))))
  }

  beforeEach(() => window.localStorage.clear())
  afterEach(async () => {
    await act(async () => root.unmount())
    wurzel.remove()
  })

  it('zeigt beim ersten Besuch den Hinweis, öffnet die Hilfe zur Seite und schließt mit Escape', async () => {
    await zeigen('/fassungen/123')
    expect(wurzel.textContent).toContain('Neu hier?')
    const knopf = wurzel.querySelector('button[aria-label="Hilfe"]') as HTMLButtonElement
    await act(async () => knopf.click())
    const fenster = wurzel.querySelector('[role="dialog"]')
    expect(fenster?.textContent).toContain('Auf dieser Seite: Eigene Fassungen')
    expect(fenster?.textContent).toContain('Quellpaket des Originals laden')
    expect(fenster?.querySelector('a[href="/anleitung"]')).not.toBeNull()
    // Hinweis ist weg und gemerkt
    expect(wurzel.textContent).not.toContain('Neu hier?')
    expect(window.localStorage.getItem('ifm-hilfe-gesehen')).toBe('1')
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(wurzel.querySelector('[role="dialog"]')).toBeNull()
  })

  it('ohne passende Seite: nur der Ablauf, aufgeklappt', async () => {
    window.localStorage.setItem('ifm-hilfe-gesehen', '1')
    await zeigen('/anleitung')
    expect(wurzel.textContent).not.toContain('Neu hier?')
    await act(async () => (wurzel.querySelector('button[aria-label="Hilfe"]') as HTMLButtonElement).click())
    const fenster = wurzel.querySelector('[role="dialog"]')!
    expect(fenster.textContent).not.toContain('Auf dieser Seite')
    expect((fenster.querySelector('details') as HTMLDetailsElement).open).toBe(true)
  })
})

/**
 * Hilfe, Anleitung und die Einrichtungs-Datei für Claude nennen Knöpfe und Felder beim Namen. Wird eine
 * Beschriftung im Tool umbenannt, soll dieser Test auffallen, damit die Texte nachgezogen werden.
 */
describe('Beschriftungen in Hilfe und Anleitung gibt es im Tool wirklich', () => {
  const hilfeDateien = ['src/components/Hilfe.tsx', 'src/pages/AnleitungPage.tsx']
  function quellen(ordner: string): string[] {
    return readdirSync(ordner).flatMap((n) => {
      const p = join(ordner, n)
      if (statSync(p).isDirectory()) return quellen(p)
      return /\.tsx?$/.test(n) && !n.includes('.test.') ? [p.replace(/\\/g, '/')] : []
    })
  }
  const tool = quellen('src')
    .filter((p) => !hilfeDateien.includes(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
  const texte = [...hilfeDateien, 'public/claude-einrichtung.md', 'scripts/quellpaket-anleitung.md']
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')

  const beschriftungen = [
    'Herunterladen:',
    '⧉ Fassungen',
    '✎ Notizen',
    'Quellpaket des Originals laden',
    'Neue Fassung hochladen',
    'Fassung hochladen',
    'Neue Version hochladen',
    'Gebautes Deck',
    'Quellpaket (der ganze Ordner als Zip)',
    'Freigegeben für',
    'Ist erledigt',
    'neuer Durchlauf',
    'Trainer aufnehmen …',
    'Aufnehmen',
    'Themen kopieren',
    'Original als Vorlage übernehmen',
    'Notizen ohne Folie',
    'Original-Notizen zeigen (statt meiner eigenen)',
    '+ eigene Kopie bearbeiten',
    '+ eigene Notizen',
    'Freigegeben von',
    'Notizen als Stichpunkte',
    'nur Stichpunkte',
    'Name speichern',
    'Passwort ändern',
    'Teilnehmer herunterladen',
  ]

  for (const b of beschriftungen) {
    it(`„${b}“`, () => {
      expect(texte, 'kommt in Hilfe/Anleitung vor').toContain(b)
      expect(tool, 'steht so im Tool').toContain(b)
    })
  }
})
