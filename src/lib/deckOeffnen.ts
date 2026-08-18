import { deckLaden } from './kurse'

/**
 * Öffnet ein Deck in einem eigenen Fenster.
 *
 * Das Fenster wird sofort beim Klick geöffnet, noch vor dem Download: Browser
 * lassen `window.open` nur direkt aus einer Nutzeraktion zu, nach einem `await`
 * greift der Popup-Blocker. Solange das Deck lädt, steht ein Hinweis darin.
 *
 * Ein eigenes Fenster statt eines eingebetteten Rahmens, weil das Deck sein
 * Trainer-Cockpit selbst als zweites Fenster öffnet und die Folien darüber
 * steuert.
 */
export function deckOeffnen(deckPfad: string, beschriftung: string): void {
  const fenster = window.open('', '_blank')
  if (!fenster) {
    window.alert(
      'Der Browser hat das Fenster blockiert. Bitte Pop-ups für diese Seite erlauben.',
    )
    return
  }

  fenster.document.write(ladeSeite(beschriftung))
  fenster.document.close()

  deckLaden(deckPfad)
    .then((url) => {
      fenster.location.href = url
      // Erst freigeben, wenn das Deck sicher geladen ist; ein zu frühes
      // Aufräumen macht die Adresse ungültig.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
    .catch((e: Error) => {
      fenster.document.body.textContent = `Deck konnte nicht geladen werden: ${e.message}`
    })
}

function ladeSeite(beschriftung: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${beschriftung}</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:#00444a;color:#faf5eb;font-family:Ubuntu,Arial,sans-serif;font-size:15px">
${beschriftung} wird geladen …</body></html>`
}
