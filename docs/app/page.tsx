import Link from "next/link"
import { RootProvider } from "fumadocs-ui/provider/next"
import { docsI18nProvider } from "@/lib/i18n"

export default function Home() {
  return (
    <RootProvider i18n={docsI18nProvider("zh-CN")} search={{ enabled: false }}>
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
        <p className="mb-4 text-sm font-medium text-fd-muted-foreground">DesKit Plugin Docs</p>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight">
          Build small, useful tools for DesKit.
        </h1>
        <p className="mb-8 max-w-2xl text-lg text-fd-muted-foreground">
          Documentation for plugin authors: commands, views, permissions, storage, packaging, and
          Marketplace submission.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/zh-CN/docs"
            className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
          >
            中文文档
          </Link>
          <Link
            href="/en/docs"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-fd-accent"
          >
            English docs
          </Link>
        </div>
      </main>
    </RootProvider>
  )
}
