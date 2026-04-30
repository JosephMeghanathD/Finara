import { createContext, useContext, useState, useCallback } from 'react'
import { authApi } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('finara_user')) } catch { return null }
  })

  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login({ email, password })
    localStorage.setItem('finara_token', data.token)
    localStorage.setItem('finara_user', JSON.stringify(data))
    setUser(data)
    return data
  }, [])

  const register = useCallback(async (payload) => {
    const { data } = await authApi.register(payload)
    localStorage.setItem('finara_token', data.token)
    localStorage.setItem('finara_user', JSON.stringify(data))
    setUser(data)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('finara_token')
    localStorage.removeItem('finara_user')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
