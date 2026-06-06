import type { ReactNode } from "react"
import { useEffect } from "react"
import i18n, { resolveLanguageMode } from "@/i18n"
import { getSettings, isElectron, onSettingsChanged } from "@/lib/electron"

function applyLanguage(language: DeskitLanguageMode): void {
  const locale = resolveLanguageMode(language)
  if (i18n.language !== locale) {
    void i18n.changeLanguage(locale)
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false
    let currentLanguage: DeskitLanguageMode = "system"

    const applyCurrentLanguage = (): void => {
      if (!cancelled) applyLanguage(currentLanguage)
    }

    applyCurrentLanguage()

    let unsubscribeSettings: (() => void) | undefined
    if (isElectron()) {
      void getSettings()
        .then((settings) => {
          currentLanguage = settings.language
          applyCurrentLanguage()
        })
        .catch((err: unknown) => {
          console.warn("[deskit] failed to load language setting; using system language", err)
        })

      unsubscribeSettings = onSettingsChanged((settings) => {
        currentLanguage = settings.language
        applyCurrentLanguage()
      })
    }

    const onSystemLanguageChange = (): void => {
      if (currentLanguage === "system") applyCurrentLanguage()
    }
    window.addEventListener("languagechange", onSystemLanguageChange)

    return () => {
      cancelled = true
      unsubscribeSettings?.()
      window.removeEventListener("languagechange", onSystemLanguageChange)
    }
  }, [])

  return children
}
