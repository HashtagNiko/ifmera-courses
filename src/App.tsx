import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TagebuchPage from './pages/TagebuchPage'
import FreigabenPage from './pages/FreigabenPage'
import NotizenPage from './pages/NotizenPage'
import FassungenPage from './pages/FassungenPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Trainer-Bereich: Sitzung + aktiver Eintrag in kt_trainer noetig */}
      <Route element={<ProtectedRoute />}>
        <Route index element={<Navigate to="/kurstage" replace />} />
        <Route path="kurstage" element={<DashboardPage />} />
        <Route path="tagebuch" element={<TagebuchPage />} />
        <Route path="freigaben" element={<FreigabenPage />} />
        <Route path="notizen/:tagId" element={<NotizenPage />} />
        <Route path="fassungen/:tagId" element={<FassungenPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
