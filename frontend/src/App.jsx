import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { TimeFilterProvider } from './hooks/useTimeFilter'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import StoryPage from './pages/StoryPage'
import TransactionsPage from './pages/TransactionsPage'
import AnomaliesPage from './pages/AnomaliesPage'
import ForecastPage from './pages/ForecastPage'
import BudgetPage from './pages/BudgetPage'
import ComparePage from './pages/ComparePage'
import SavingsPage from './pages/SavingsPage'
import ChatPage from './pages/ChatPage'
import CoachPage from './pages/CoachPage'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<PrivateRoute><TimeFilterProvider><Layout /></TimeFilterProvider></PrivateRoute>}>
          <Route index                element={<DashboardPage />} />
          <Route path="upload"        element={<UploadPage />} />
          <Route path="story"         element={<StoryPage />} />
          <Route path="transactions"  element={<TransactionsPage />} />
          <Route path="anomalies"     element={<AnomaliesPage />} />
          <Route path="forecast"      element={<ForecastPage />} />
          <Route path="budget"        element={<BudgetPage />} />
          <Route path="compare"       element={<ComparePage />} />
          <Route path="savings"       element={<SavingsPage />} />
          <Route path="chat"          element={<ChatPage />} />
          <Route path="coach"         element={<CoachPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
