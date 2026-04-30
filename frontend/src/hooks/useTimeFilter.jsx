import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { txnApi } from '../utils/api'

const TimeFilterContext = createContext(null)

export function TimeFilterProvider({ children }) {
  const [months, setMonths]         = useState([])
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth]     = useState('')

  useEffect(() => {
    txnApi.months().then(r => {
      const data = r.data || []
      setMonths(data)
      if (data.length > 0) { setStartMonth(data[0]); setEndMonth(data[0]) }
    }).catch(() => {})
  }, [])

  const setRange = useCallback(({ startMonth: s, endMonth: e }) => {
    setStartMonth(s)
    setEndMonth(e)
  }, [])

  return (
    <TimeFilterContext.Provider value={{ months, startMonth, endMonth, setRange }}>
      {children}
    </TimeFilterContext.Provider>
  )
}

export const useTimeFilter = () => useContext(TimeFilterContext)
