import { useState, useCallback } from 'react'

export const BASE_COLORS = {
  'Food & Drink':   '#6366F1',
  'Groceries':      '#8B5CF6',
  'Transport':      '#0EA5E9',
  'Shopping':       '#F59E0B',
  'Entertainment':  '#10B981',
  'Healthcare':     '#EF4444',
  'Utilities':      '#6366F1',
  'Rent & Housing': '#84CC16',
  'Travel':         '#F97316',
  'Financial':      '#64748B',
  'Subscriptions':  '#A78BFA',
  'Personal Care':  '#EC4899',
}

const EXTRA_PALETTE = [
  '#06B6D4', '#D946EF', '#F43F5E', '#22C55E', '#FB923C',
  '#A3E635', '#818CF8', '#2DD4BF', '#FCD34D', '#C084FC',
]

const DEFAULT_LIST = Object.keys(BASE_COLORS)
const STORAGE_KEY  = 'finara_custom_categories'

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export function useCategories() {
  const [custom, setCustom] = useState(loadCustom)

  const colorMap = { ...BASE_COLORS }
  custom.forEach(c => { colorMap[c.name] = c.color })

  const categories = [...DEFAULT_LIST, ...custom.map(c => c.name)]

  const getColor = cat => colorMap[cat] || '#94A3B8'

  const addCategory = useCallback(name => {
    const trimmed = name.trim()
    if (!trimmed) return false
    const existing = [...DEFAULT_LIST, ...custom.map(c => c.name)]
    if (existing.map(s => s.toLowerCase()).includes(trimmed.toLowerCase())) return false
    const color   = EXTRA_PALETTE[custom.length % EXTRA_PALETTE.length]
    const updated = [...custom, { name: trimmed, color }]
    setCustom(updated)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch {}
    return true
  }, [custom])

  return { categories, colorMap, getColor, addCategory }
}
