import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { txnApi } from '../utils/api'
import { format, parseISO, endOfMonth } from 'date-fns'

const TimeFilterContext = createContext(null)

export function TimeFilterProvider({ children }) {
  const [months,    setMonths]    = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [minDate,   setMinDate]   = useState('')
  const [maxDate,   setMaxDate]   = useState('')

  useEffect(() => {
    txnApi.months().then(r => {
      const data = r.data || []
      setMonths(data)
      if (data.length > 0) {
        const newest  = data[0]                     // most recent (desc sorted)
        const oldest  = data[data.length - 1]
        const today   = format(new Date(), 'yyyy-MM-dd')
        const min     = oldest + '-01'
        const newestLastDay = format(endOfMonth(parseISO(newest + '-01')), 'yyyy-MM-dd')

        setMinDate(min)
        setMaxDate(today)
        setStartDate(newest + '-01')
        setEndDate(newestLastDay < today ? newestLastDay : today)
      }
    }).catch(() => {})
  }, [])

  const setRange = useCallback(({ startDate: s, endDate: e }) => {
    setStartDate(s)
    setEndDate(e)
  }, [])

  const startMonth = startDate ? startDate.slice(0, 7) : ''
  const endMonth   = endDate   ? endDate.slice(0, 7)   : ''

  return (
    <TimeFilterContext.Provider value={{
      months, startDate, endDate, startMonth, endMonth, minDate, maxDate, setRange,
    }}>
      {children}
    </TimeFilterContext.Provider>
  )
}

export const useTimeFilter = () => useContext(TimeFilterContext)
