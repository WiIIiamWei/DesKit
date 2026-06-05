import type { ReactNode } from "react"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { RootProvider } from "fumadocs-ui/provider/next"
import { docsI18nProvider } from "@/lib/i18n"
import { source } from "@/lib/source"

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider i18n={docsI18nProvider("zh-CN")} search={{ enabled: false }}>
      <DocsLayout
        tree={source.getPageTree("zh-CN")}
        nav={{ title: "DesKit Plugin Docs" }}
        githubUrl="https://github.com/WiIIiamWei/DesKit"
      >
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
