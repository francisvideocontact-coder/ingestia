import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import AuthGuard from '@/components/auth/AuthGuard'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import GoogleCallbackPage from '@/pages/auth/GoogleCallbackPage'
import CreateWorkspacePage from '@/pages/workspace/CreateWorkspacePage'
import DashboardPage from '@/pages/DashboardPage'
import MailPage from '@/pages/MailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Routes publiques */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />

        {/* Routes protégées */}
        <Route element={<AuthGuard />}>
          <Route path="/workspace/create" element={<CreateWorkspacePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/mail" element={<MailPage />} />
        </Route>

        {/* Redirect par défaut */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      <Toaster />
    </BrowserRouter>
  )
}
