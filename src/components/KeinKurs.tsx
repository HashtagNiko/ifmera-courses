import { Link } from 'react-router-dom'

/** Hinweis für Trainer ohne eigenen und ohne freigegebenen Kurs. */
export default function KeinKurs() {
  return (
    <p className="rounded-lg bg-ifm-lightblue text-ifm-blue text-sm p-4">
      Dir ist noch kein Kurs freigegeben. Sobald dir ein Trainer einen Kurs freigibt, erscheint er
      hier. Einen eigenen Kurs legst du unter{' '}
      <Link to="/eigene-kurse" className="font-medium underline underline-offset-2">
        „Eigene Kurse“
      </Link>{' '}
      an.
    </p>
  )
}
