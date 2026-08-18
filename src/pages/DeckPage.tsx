import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deckUrl } from '../lib/kurse'

/**
 * Zeigt ein Deck bildschirmfüllend. Der Browser erlaubt echtes Vollbild nur
 * nach einer Nutzeraktion, deshalb der Button oben rechts; ohne ihn liefe das
 * Deck zwar auch, aber mit Adressleiste.
 */
export default function DeckPage() {
  const { kurstagId } = useParams()
  const navigate = useNavigate()
  const rahmen = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [titel, setTitel] = useState<string>('')
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!kurstagId) return
    let aktiv = true

    async function laden() {
      const { data, error } = await supabase
        .from('kurstage')
        .select('nummer, titel, deck_pfad')
        .eq('id', kurstagId)
        .single()

      if (error || !data) {
        if (aktiv) setFehler(error?.message ?? 'Kurstag nicht gefunden.')
        return
      }
      if (!data.deck_pfad) {
        if (aktiv) setFehler('Für diesen Tag ist noch kein Deck hinterlegt.')
        return
      }

      try {
        const signiert = await deckUrl(data.deck_pfad)
        if (!aktiv) return
        setTitel(`Tag ${data.nummer}${data.titel ? ' · ' + data.titel : ''}`)
        setUrl(signiert)
      } catch (e) {
        if (aktiv) setFehler((e as Error).message)
      }
    }

    laden()
    return () => {
      aktiv = false
    }
  }, [kurstagId])

  function vollbild() {
    rahmen.current?.requestFullscreen?.().catch(() => {
      /* Vollbild abgelehnt: Deck läuft trotzdem, nur im Fenster */
    })
  }

  if (fehler) {
    return (
      <div className="min-h-full bg-ifm-cream flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <p className="text-sm text-ifm-blue">{fehler}</p>
          <button
            onClick={() => navigate('/kurstage')}
            className="mt-6 rounded-lg bg-ifm-blue text-white px-4 py-2 text-sm font-medium"
          >
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={rahmen} className="h-full bg-black flex flex-col">
      <div className="flex items-center gap-3 bg-ifm-blue px-4 py-2 text-white">
        <button onClick={() => navigate('/kurstage')} className="text-sm hover:underline">
          ← Übersicht
        </button>
        <span className="flex-1 text-sm font-medium">{titel}</span>
        <button onClick={vollbild} className="text-sm hover:underline">
          Vollbild
        </button>
      </div>
      {url ? (
        <iframe src={url} title={titel} className="flex-1 w-full border-0" allow="fullscreen" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-white/70 text-sm">
          Deck wird geladen …
        </div>
      )}
    </div>
  )
}
