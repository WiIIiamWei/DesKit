import type { ReactNode } from "react"
import { RootProvider } from "fumadocs-ui/provider/next"
import { docsI18nProvider } from "@/lib/i18n"

type Props = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export default async function LocaleLayout({ children, params }: Props) {
  const { lang } = await params

  return (
    <RootProvider i18n={docsI18nProvider(lang)} search={{ enabled: false }}>
      {children}
    </RootProvider>
  )
}
