import { createContext, useContext, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  useEffect(() => {
    // Always use dark mode
    document.documentElement.setAttribute('data-theme', 'dark')
    const meta = document.getElementById('theme-color-meta')
    if (meta) meta.setAttribute('content', '#0f0f0d')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: 'dark', isDark: true }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
