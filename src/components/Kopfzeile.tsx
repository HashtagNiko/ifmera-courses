import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

/** Kopfzeile mit dem Wechsel zwischen Kachelansicht und Trainertagebuch. */
export default function Kopfzeile({ titel }: { titel: string }) {
  const { signOut, user } = useAuth()

  return (
    <header className="bg-white border-b border-ifm-lightblue">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
        <img src="/logo.png" alt="ifmera academy" className="h-8 w-auto" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ifm-blue">{titel}</h1>
          <p className="text-xs text-ifm-gray truncate">{user?.email}</p>
        </div>

        <nav className="ml-6 flex gap-1">
          <Reiter zu="/kurstage">Kurstage</Reiter>
          <Reiter zu="/tagebuch">Tagebuch</Reiter>
        </nav>

        <button onClick={signOut} className="ml-auto text-sm text-ifm-gray hover:text-ifm-blue">
          Abmelden
        </button>
      </div>
    </header>
  )
}

function Reiter({ zu, children }: { zu: string; children: string }) {
  return (
    <NavLink
      to={zu}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-medium ${
          isActive ? 'bg-ifm-blue text-white' : 'text-ifm-blue hover:bg-ifm-lightblue'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
