import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { FloatingBallPanel } from "@/components/floating-ball-panel"
import { LauncherPanel } from "@/components/launcher-panel"
import { ImageAnnotatorPage } from "@/components/screenshot/image-annotator-page"
import { PinnedImagePage } from "@/components/screenshot/pinned-image-page"
import { ScreenshotOcrPage } from "@/components/screenshot/screenshot-ocr-page"
import { ScreenshotOverlayPage } from "@/components/screenshot/screenshot-overlay-page"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/hooks/use-theme"

type RendererRoute =
  | "shell"
  | "launcher"
  | "floating-ball"
  | "floating-ball-menu"
  | "screenshot-overlay"
  | "screenshot-annotator"
  | "screenshot-ocr"
  | "pinned-image"

function isLauncherRoute(): boolean {
  if (typeof window === "undefined") return false
  return window.location.hash === "#search" || window.location.hash === "#launcher"
}

function getRendererRoute(): RendererRoute {
  if (typeof window === "undefined") return "shell"
  if (window.location.hash === "#floating-ball") return "floating-ball"
  if (window.location.hash === "#floating-ball-menu") return "floating-ball-menu"
  if (window.location.hash === "#screenshot-overlay") return "screenshot-overlay"
  if (window.location.hash === "#screenshot-annotator") return "screenshot-annotator"
  if (window.location.hash === "#screenshot-ocr") return "screenshot-ocr"
  if (window.location.hash === "#pinned-image") return "pinned-image"
  return isLauncherRoute() ? "launcher" : "shell"
}

export function App() {
  const [route, setRoute] = useState<RendererRoute>(getRendererRoute)

  // The same renderer bundle is loaded into two windows that differ only
  // by hash. We honour navigation changes so a `loadURL` swap re-renders
  // into the right shell.
  useEffect(() => {
    const onHashChange = (): void => setRoute(getRendererRoute())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  return (
    <ThemeProvider>
      <TooltipProvider>
        {route === "launcher" ? (
          <LauncherPanel />
        ) : route === "floating-ball" || route === "floating-ball-menu" ? (
          <FloatingBallPanel />
        ) : route === "screenshot-overlay" ? (
          <ScreenshotOverlayPage />
        ) : route === "screenshot-annotator" ? (
          <ImageAnnotatorPage />
        ) : route === "screenshot-ocr" ? (
          <ScreenshotOcrPage />
        ) : route === "pinned-image" ? (
          <PinnedImagePage />
        ) : (
          <div className="h-screen bg-background font-sans text-foreground">
            <AppShell />
          </div>
        )}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}
