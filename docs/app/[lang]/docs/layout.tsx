import type { ReactNode } from "react"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { source } from "@/lib/source"

type Props = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export default async function Layout({ children, params }: Props) {
  const { lang } = await params

  return (
    <DocsLayout
      tree={source.getPageTree(lang)}
      nav={{ title: "DesKit Plugin Docs" }}
      githubUrl="https://github.com/WiIIiamWei/DesKit"
    >
      {children}
    </DocsLayout>
  )
}
