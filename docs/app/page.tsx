"use client"

export default function Home() {
  if (typeof window !== "undefined") {
    const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language]
    const locale = languages.some((language) => language.toLowerCase().startsWith("zh"))
      ? "zh-CN"
      : "en"

    window.location.replace(`/${locale}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm text-fd-muted-foreground">Redirecting to DesKit documentation...</p>
        <div className="mt-4 flex justify-center gap-3 text-sm">
          <a className="underline" href="/zh-CN">
            中文
          </a>
          <a className="underline" href="/en">
            English
          </a>
        </div>
      </div>
    </main>
  )
}
