import { Globe2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getSettings, isElectron, onSettingsChanged, updateSettings } from "@/lib/electron"

const LANGUAGE_OPTIONS: DeskitLanguageMode[] = ["system", "zh-CN", "en"]

export function LanguageSettings() {
  const { t } = useTranslation()
  const [language, setLanguage] = useState<DeskitLanguageMode>("system")

  useEffect(() => {
    if (!isElectron()) return
    let cancelled = false
    void getSettings()
      .then((settings) => {
        if (!cancelled) setLanguage(settings.language)
      })
      .catch((err: unknown) => {
        console.warn("[deskit] failed to load language setting", err)
      })
    const unsubscribe = onSettingsChanged((settings) => setLanguage(settings.language))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  async function onLanguageChange(next: DeskitLanguageMode) {
    setLanguage(next)
    if (isElectron()) {
      try {
        const settings = await updateSettings({ language: next })
        setLanguage(settings.language)
      } catch (err) {
        console.warn("[deskit] failed to update language setting", err)
      }
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe2 className="size-4 text-primary" aria-hidden />
          {t("language.title")}
        </CardTitle>
        <CardDescription>{t("language.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="responsive">
          <FieldContent>
            <FieldLabel htmlFor="language-select">{t("language.label")}</FieldLabel>
            <FieldDescription>{t("language.description")}</FieldDescription>
          </FieldContent>
          <NativeSelect
            id="language-select"
            value={language}
            className="min-w-48"
            onChange={(event) => void onLanguageChange(event.target.value as DeskitLanguageMode)}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {t(`language.options.${option}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </CardContent>
    </Card>
  )
}
