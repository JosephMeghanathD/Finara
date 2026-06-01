import { createContext, useContext, useState, useEffect } from 'react'
import { loadingBus } from '../utils/loadingBus'

const LoadingContext = createContext([])

export function LoadingProvider({ children }) {
  const [loads, setLoads] = useState([])

  useEffect(() => {
    return loadingBus.subscribe(setLoads)
  }, [])

  return (
    <LoadingContext.Provider value={loads}>
      {children}
    </LoadingContext.Provider>
  )
}

export const useActiveLoads = () => useContext(LoadingContext)
