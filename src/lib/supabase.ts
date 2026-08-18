import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Ob die Supabase-Zugangsdaten in der .env hinterlegt sind. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Geteilter Supabase-Client für die ganze App (Projekt "shnoozy-App", dasselbe
 * wie beim Prüfungstool). Erst nutzbar, sobald VITE_SUPABASE_URL und
 * VITE_SUPABASE_ANON_KEY gesetzt sind; wir werfen erst beim tatsächlichen
 * Zugriff, damit das Gerüst auch ohne Keys startet.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            'Supabase ist nicht konfiguriert. Bitte VITE_SUPABASE_URL und ' +
              'VITE_SUPABASE_ANON_KEY in der .env-Datei setzen (siehe .env.example).',
          )
        },
      },
    ) as ReturnType<typeof createClient>)
