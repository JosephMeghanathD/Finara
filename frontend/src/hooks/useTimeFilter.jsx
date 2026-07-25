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
        const newestLastDay = format(endOfMonth(parseISO(newest + '-01')), 'yyyy-MM-dd')

        // Bound by the data, not the wall clock. Clamping to today inverted the
        // default range whenever statements ran past today (start after end), and
        // made the newest months unselectable.
        setMinDate(oldest + '-01')
        setMaxDate(newestLastDay)

        // Default: the last 1 month of data, calendar-aligned. Alignment matters —
        // consumers derive startMonth/endMonth via slice(0,7), so a trailing
        // 30-day window would straddle two months and widen every query.
        setStartDate(newest + '-01')
        setEndDate(newestLastDay)
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
