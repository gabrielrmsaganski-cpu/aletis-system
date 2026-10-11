import { useEffect, useState } from 'react'
import {
  EMPTY_NAVIGATION, NAVIGATION_EVENT, NAVIGATION_KEY,
  parseNavigationPreferences, toolVisit, withToolVisit, type NavigationPreferences,
} from '../navigation/navigationPreferences'

function read(): NavigationPreferences {
  try { return parseNavigationPreferences(window.localStorage.getItem(NAVIGATION_KEY)) }
  catch { return EMPTY_NAVIGATION }
}

function write(next: NavigationPreferences): void {
  try { window.localStorage.setItem(NAVIGATION_KEY, JSON.stringify(next)) } catch { /* Preferências locais opcionais. */ }
  window.dispatchEvent(new CustomEvent(NAVIGATION_EVENT, { detail: next }))
}

export function rememberToolVisit(pathname: string, search: string): void {
  const visit = toolVisit(pathname, search)
  if (!visit) return
  const current = read()
  if (current.recent[0]?.route === visit.route) return
  write(withToolVisit(current, visit))
}

export function useNavigationPreferences() {
  const [preferences, setPreferences] = useState(read)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === NAVIGATION_KEY) setPreferences(read()) }
    const onChange = (event: Event) => setPreferences((event as CustomEvent<NavigationPreferences>).detail)
    window.addEventListener('storage', onStorage)
    window.addEventListener(NAVIGATION_EVENT, onChange)
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(NAVIGATION_EVENT, onChange) }
  }, [])
  const toggleFavorite = (id: string) => {
    const current = read()
    const favorites = current.favorites.includes(id)
      ? current.favorites.filter((value) => value !== id)
      : [...current.favorites, id].slice(-8)
    write({ ...current, favorites })
  }
  return {
    ...preferences,
    toggleFavorite,
    routeForTool: (id: string, fallback: string) => preferences.recent.find((item) => item.toolId === id)?.route ?? fallback,
  }
}
