import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', monthlyIncome: '' })
  const [loading, setLoading] = useState(false)

  const handle = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await register({ ...form, monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : null })
      navigate('/')
      toast.success('Welcome to Finara!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally { setLoading(false) }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const inputStyle = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--brand)' }}>
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Create account</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Start your financial journey</p>
        </div>

        <div className="card">
          <form onSubmit={handle} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              {[['firstName','First name'],['lastName','Last name']].map(([k,label]) => (
                <div key={k}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{label}</label>
                  <input className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={inputStyle} value={form[k]} onChange={e => f(k, e.target.value)}
                    required={k==='firstName'} />
                </div>
              ))}
            </div>
            {[
              ['email','Email','email','you@example.com'],
              ['password','Password','password','Min 6 characters'],
              ['monthlyIncome','Monthly income (optional)','number','3000'],
            ].map(([k,label,type,ph]) => (
              <div key={k}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{label}</label>
                <input type={type} placeholder={ph}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle} value={form[k]} onChange={e => f(k, e.target.value)}
                  required={k!=='monthlyIncome'} min={k==='monthlyIncome'?0:undefined} />
              </div>
            ))}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-1">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="text-center mt-4 text-sm" style={{ color: 'var(--text-3)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
