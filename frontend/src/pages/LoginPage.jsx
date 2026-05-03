import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import FianaLogo from '../components/FinaraLogo'

export default function LoginPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [form, setForm]     = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handle = async e => {
    e.preventDefault()
    setLoading(true)
    try { await login(form.email, form.password); navigate('/') }
    catch (err) { toast.error(err.response?.data?.message || 'Invalid credentials') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="flex justify-center mb-3">
            <FianaLogo size={44} />
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Welcome back</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Sign in to your Fiana account</p>
        </div>

        <div className="card">
          <form onSubmit={handle} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Email</label>
              <input type="email" required placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text)' }}
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Password</label>
              <input type="password" required placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text)' }}
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-1">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="text-center mt-4 text-sm" style={{ color: 'var(--text-3)' }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'var(--brand)', fontWeight: 500 }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
