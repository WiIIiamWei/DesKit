import type { NavId } from "../app-shell"
import { CircleDot, Settings as SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function FloatingBallPage({ onNavigate }: { onNavigate: (id: NavId) => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("floatingBall.feature.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("floatingBall.feature.subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDot className="size-4 text-primary" aria-hidden />
            {t("floatingBall.feature.aboutTitle")}
          </CardTitle>
          <CardDescription>{t("floatingBall.feature.aboutBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => onNavigate("settings")}>
            <SettingsIcon className="size-3.5" aria-hidden />
            {t("floatingBall.feature.openSettings")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
