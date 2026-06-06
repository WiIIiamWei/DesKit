import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { i18n } from "@/lib/i18n"

const GITHUB_URL = "https://github.com/WiIIiamWei/DesKit"

const content = {
  "zh-CN": {
    badge: "DesKit 桌面效率工具",
    title: "把常用工具放到最顺手的位置",
    description:
      "DesKit 将启动器、局域网传输、悬浮球和插件市场整合到一个轻量桌面应用中。它面向日常效率，也为插件开发者提供可发布、可审查的扩展体系。",
    primaryCta: "阅读插件文档",
    secondaryCta: "查看 GitHub",
    languageLabel: "English",
    imageAlt: "DesKit 中文主页截图",
    docsHref: "/zh-CN/docs",
    languageHref: "/en",
    cards: [
      {
        title: "应用启动器",
        description: "快速搜索并打开应用、命令和插件功能，把重复操作压缩到一次输入。",
      },
      {
        title: "局域网传输",
        description: "在同一网络中的设备之间传输内容，减少临时文件和聊天软件中转。",
      },
      {
        title: "桌面悬浮球",
        description: "把高频功能固定在桌面边缘，需要时一键展开，不打断当前工作流。",
      },
      {
        title: "插件",
        description: "通过受控权限、设置项和视图能力扩展 DesKit，适合构建小而明确的工具。",
      },
      {
        title: "应用市场",
        description: "从 Marketplace 安装经过声明和校验的插件，也方便开发者提交自己的作品。",
      },
      {
        title: "更多功能",
        description: "历史剪贴板、时间戳转换、计算器等能力可以持续扩展，而无需改动主程序。",
      },
    ],
  },
  en: {
    badge: "DesKit desktop productivity",
    title: "Keep useful tools exactly where you need them",
    description:
      "DesKit brings the launcher, LAN transfer, floating ball, and plugin marketplace into a lightweight desktop app. It is built for everyday productivity and gives plugin authors a reviewable extension system.",
    primaryCta: "Read Plugin Docs",
    secondaryCta: "View on GitHub",
    languageLabel: "简体中文",
    imageAlt: "DesKit English home screenshot",
    docsHref: "/en/docs",
    languageHref: "/zh-CN",
    cards: [
      {
        title: "App Launcher",
        description:
          "Search apps, commands, and plugin features quickly, turning repeated actions into one focused input.",
      },
      {
        title: "LAN Transfer",
        description:
          "Move content between devices on the same network without temporary files or chat-app detours.",
      },
      {
        title: "Desktop Floating Ball",
        description:
          "Keep frequent actions on the edge of the desktop and expand them when needed without breaking focus.",
      },
      {
        title: "Plugins",
        description:
          "Extend DesKit with controlled permissions, preferences, and views for small, well-scoped tools.",
      },
      {
        title: "Marketplace",
        description:
          "Install declared and validated plugins from the Marketplace, or submit your own work as a developer.",
      },
      {
        title: "More Features",
        description:
          "Clipboard history, timestamp conversion, calculator, and other capabilities can grow without changing the core app.",
      },
    ],
  },
} as const

type Props = {
  params: Promise<{ lang: string }>
}

export default async function LocalizedHome({ params }: Props) {
  const { lang } = await params
  const locale = lang === "en" ? "en" : "zh-CN"
  const page = content[locale]
  const imageSrc = locale === "zh-CN" ? "/main-zh.png" : "/main.png"

  return (
    <main className="min-h-screen bg-fd-background">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-12 px-6 py-12 md:px-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full border bg-fd-muted px-3 py-1 text-sm font-medium text-fd-muted-foreground">
              {page.badge}
            </span>
            <Link
              href={page.languageHref}
              className="rounded-full border px-3 py-1 text-sm font-medium hover:bg-fd-accent"
            >
              {page.languageLabel}
            </Link>
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-fd-foreground md:text-6xl">
            {page.title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-fd-muted-foreground">
            {page.description}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={page.docsHref}
              className="rounded-xl bg-fd-primary px-5 py-3 text-sm font-semibold text-fd-primary-foreground"
            >
              {page.primaryCta}
            </Link>
            <a
              href={GITHUB_URL}
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold hover:bg-fd-accent"
            >
              <GitHubIcon />
              {page.secondaryCta}
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-6 -z-10 rounded-[2rem] bg-fd-primary/10 blur-3xl" />
          <div className="overflow-hidden rounded-[2rem] border bg-fd-card shadow-2xl">
            <Image
              src={imageSrc}
              alt={page.imageAlt}
              width={1280}
              height={800}
              priority
              className="h-auto w-full"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 pb-20 md:px-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.cards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border bg-fd-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-fd-foreground">{card.title}</h2>
              <p className="mt-3 leading-7 text-fd-muted-foreground">{card.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  const locale = lang === "en" ? "en" : "zh-CN"

  return {
    title: locale === "zh-CN" ? "DesKit" : "DesKit",
    description:
      locale === "zh-CN"
        ? "DesKit 桌面效率工具和插件开发文档。"
        : "DesKit desktop productivity app and plugin development documentation.",
  }
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.9c-2.78.62-3.37-1.22-3.37-1.22-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.36 1.11 2.93.85.09-.67.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.96c.85 0 1.7.12 2.5.35 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.49A10.08 10.08 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}
