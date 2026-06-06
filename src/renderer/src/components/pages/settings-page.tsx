import { useTranslation } from "react-i18next"
import { AppearanceSettings } from "@/components/appearance-settings"
import { FloatingBallSettings } from "@/components/floating-ball-settings"
import { LanguageSettings } from "@/components/language-settings"
import { LauncherSettings } from "@/components/launcher-settings"
import { SyncSettings } from "@/components/sync-settings"

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </header>
      <SyncSettings />
      <AppearanceSettings />
      <FloatingBallSettings />
      <LauncherSettings />
      <LanguageSettings />
    </div>
  )
}
