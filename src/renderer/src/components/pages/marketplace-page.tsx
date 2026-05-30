import { Send, Store } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function MarketplacePage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("marketplace.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("marketplace.subtitle")}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button disabled>
                <Send className="size-4" aria-hidden />
                {t("marketplace.submit")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("marketplace.submitTooltip")}</TooltipContent>
        </Tooltip>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="size-4 text-primary" aria-hidden />
            {t("marketplace.comingSoonTitle")}
          </CardTitle>
          <CardDescription>{t("marketplace.comingSoonBody")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("marketplace.gitIntegrationHint")}
        </CardContent>
      </Card>
    </div>
  )
}
