import type { GitHubDeviceAuthorization, SyncRunResult, SyncStatus } from "@/lib/electron"
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  Github,
  KeyRound,
  LogOut,
  RefreshCw,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  applyLocalSync,
  applyRemoteSync,
  configureSyncPassphrase,
  disconnectSync,
  getSyncStatus,
  isElectron,
  openExternalUrl,
  pollGitHubLogin,
  pullSync,
  pushSync,
  saveSyncClientId,
  saveSyncGistId,
  startGitHubLogin,
} from "@/lib/electron"
import { nextGitHubLoginPollInterval, syncErrorMessageKey } from "./sync-settings-utils"

type BusyAction =
  | "load"
  | "client"
  | "login"
  | "passphrase"
  | "pull"
  | "push"
  | "remote"
  | "local"
  | "disconnect"

export function SyncSettings() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [clientId, setClientId] = useState("")
  const [gistId, setGistId] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [rememberPassphrase, setRememberPassphrase] = useState(true)
  const [authorization, setAuthorization] = useState<GitHubDeviceAuthorization | null>(null)
  const [loginPollInterval, setLoginPollInterval] = useState(5)
  const [busy, setBusy] = useState<BusyAction | null>(null)
  const [message, setMessage] = useState<string>("")

  const canSync = Boolean(status?.configured && status.loggedIn && status.hasSavedPassphrase)

  useEffect(() => {
    if (!isElectron()) return
    void refreshStatus()
  }, [])

  const pollLogin = useCallback(async () => {
    if (!authorization) return
    try {
      const result = await pollGitHubLogin(authorization.deviceCode)
      if (result.status === "authenticated") {
        setAuthorization(null)
        setLoginPollInterval(5)
        setStatus(await getSyncStatus())
        setMessage(t("sync.messages.loginDone", { login: result.login }))
      } else {
        if (result.status === "slow_down") {
          setLoginPollInterval(nextGitHubLoginPollInterval)
        }
        setMessage(t(`sync.messages.login.${result.status}`))
      }
    } catch (err) {
      setMessage(errorMessage(err, t))
    }
  }, [authorization, t])

  useEffect(() => {
    if (!authorization) return
    const intervalMs = Math.max(loginPollInterval, 2) * 1000
    const timer = window.setInterval(() => {
      void pollLogin()
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [authorization, loginPollInterval, pollLogin])

  const statusText = useMemo(() => {
    if (!isElectron()) return t("sync.unavailable")
    if (!status) return t("sync.loading")
    if (!status.configured) return t("sync.status.needsClient")
    if (!status.loggedIn) return t("sync.status.needsLogin")
    if (!status.enabled || !status.hasSavedPassphrase) return t("sync.status.needsPassphrase")
    if (status.pendingConflict) return t("sync.status.conflict")
    return t("sync.status.ready")
  }, [status, t])

  async function refreshStatus() {
    setBusy("load")
    try {
      const next = await getSyncStatus()
      setStatus(next)
      setClientId("")
      setGistId("")
      setRememberPassphrase(next.rememberPassphrase)
    } finally {
      setBusy(null)
    }
  }

  async function saveClient() {
    await run("client", async () => {
      setStatus(await saveSyncClientId(clientId))
      setClientId("")
      setMessage(t("sync.messages.clientSaved"))
    })
  }

  async function saveGist() {
    await run("client", async () => {
      setStatus(await saveSyncGistId(gistId))
      setGistId("")
      setMessage(t("sync.messages.gistSaved"))
    })
  }

  async function startLogin() {
    await run("login", async () => {
      const next = await startGitHubLogin()
      setAuthorization(next)
      setLoginPollInterval(next.interval)
      setMessage(t("sync.messages.loginStarted"))
      await openExternalUrl(next.verificationUri)
    })
  }

  async function savePassphrase() {
    await run("passphrase", async () => {
      setStatus(await configureSyncPassphrase(passphrase, rememberPassphrase))
      setPassphrase("")
      setMessage(t("sync.messages.passphraseSaved"))
    })
  }

  async function manualPull() {
    await run("pull", async () => {
      const result = await pullSync(passphrase || undefined)
      await handleSyncResult(result, t("sync.messages.pulled"))
    })
  }

  async function manualPush() {
    await run("push", async () => {
      const result = await pushSync(passphrase || undefined)
      await handleSyncResult(result, t("sync.messages.pushed"))
    })
  }

  async function chooseRemote() {
    await run("remote", async () => {
      setStatus(await applyRemoteSync())
      setMessage(t("sync.messages.remoteApplied"))
    })
  }

  async function chooseLocal() {
    await run("local", async () => {
      const result = await applyLocalSync(passphrase || undefined)
      await handleSyncResult(result, t("sync.messages.localUploaded"))
    })
  }

  async function disconnect() {
    await run("disconnect", async () => {
      setStatus(await disconnectSync())
      setAuthorization(null)
      setLoginPollInterval(5)
      setMessage(t("sync.messages.disconnected"))
    })
  }

  async function handleSyncResult(result: SyncRunResult, successMessage: string) {
    if (result.status === "conflict") {
      setStatus(await getSyncStatus())
      setMessage(t("sync.messages.conflict"))
      return
    }
    setStatus(await getSyncStatus())
    setMessage(successMessage)
  }

  async function run(action: BusyAction, fn: () => Promise<void>) {
    setBusy(action)
    setMessage("")
    try {
      await fn()
    } catch (err) {
      setMessage(errorMessage(err, t))
    } finally {
      setBusy(null)
    }
  }

  if (!isElectron()) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="size-4 text-primary" aria-hidden />
            {t("sync.title")}
          </CardTitle>
          <CardDescription>{t("sync.unavailable")}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-4 text-primary" aria-hidden />
          {t("sync.title")}
        </CardTitle>
        <CardDescription>{t("sync.subtitle")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {status?.pendingConflict ? (
              <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
            ) : canSync ? (
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <Cloud className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate text-sm font-medium">{statusText}</span>
          </div>
          {status?.githubUserLogin ? (
            <span className="text-xs text-muted-foreground">@{status.githubUserLogin}</span>
          ) : null}
        </div>

        {!status?.configured ? (
          <div className="grid gap-2">
            <Label htmlFor="sync-client-id">{t("sync.clientId")}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="sync-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={t("sync.clientIdPlaceholder")}
              />
              <Button
                type="button"
                onClick={saveClient}
                disabled={!clientId.trim() || busy === "client"}
              >
                {t("sync.save")}
              </Button>
            </div>
            <FieldDescription>{t("sync.clientIdHint")}</FieldDescription>
          </div>
        ) : null}

        {status?.configured && !status.loggedIn ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className="w-fit"
              onClick={startLogin}
              disabled={busy === "login"}
            >
              <Github className="size-4" aria-hidden />
              {t("sync.login")}
            </Button>
            {authorization ? (
              <div className="rounded-md border border-border/70 p-3">
                <div className="text-xs text-muted-foreground">{t("sync.userCode")}</div>
                <div className="font-mono text-xl font-semibold tracking-widest">
                  {authorization.userCode}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void openExternalUrl(authorization.verificationUri)}
                >
                  {t("sync.openGitHub")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {status?.configured ? (
          <div className="grid gap-2">
            <Label htmlFor="sync-gist-id">{t("sync.gistId")}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="sync-gist-id"
                value={gistId}
                onChange={(event) => setGistId(event.target.value)}
                placeholder={status.gistId ?? t("sync.gistIdPlaceholder")}
              />
              <Button
                type="button"
                variant="outline"
                onClick={saveGist}
                disabled={!gistId.trim() || busy === "client"}
              >
                {t("sync.save")}
              </Button>
            </div>
            <FieldDescription>{t("sync.gistIdHint")}</FieldDescription>
          </div>
        ) : null}

        {status?.loggedIn ? (
          <div className="grid gap-2">
            <Label htmlFor="sync-passphrase">{t("sync.passphrase")}</Label>
            <Input
              id="sync-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder={status.hasSavedPassphrase ? t("sync.passphraseSaved") : ""}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={rememberPassphrase}
                onCheckedChange={(checked) => setRememberPassphrase(checked === true)}
              />
              {t("sync.remember")}
            </label>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={savePassphrase}
              disabled={!passphrase.trim() || busy === "passphrase"}
            >
              <KeyRound className="size-4" aria-hidden />
              {t("sync.savePassphrase")}
            </Button>
          </div>
        ) : null}

        {status?.pendingConflict ? (
          <div className="flex flex-col gap-3 rounded-md border border-destructive/40 p-3">
            <div className="text-sm font-medium">{t("sync.conflictTitle")}</div>
            <FieldDescription>
              {t("sync.conflictBody", { updatedAt: status.pendingConflict.updatedAt })}
            </FieldDescription>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={chooseRemote}
                disabled={busy === "remote"}
              >
                <Download className="size-4" aria-hidden />
                {t("sync.useRemote")}
              </Button>
              <Button type="button" onClick={chooseLocal} disabled={busy === "local"}>
                <Upload className="size-4" aria-hidden />
                {t("sync.useLocal")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={manualPull}
            disabled={!canSync || busy === "pull"}
          >
            <Download className="size-4" aria-hidden />
            {t("sync.pull")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={manualPush}
            disabled={!canSync || busy === "push"}
          >
            <Upload className="size-4" aria-hidden />
            {t("sync.push")}
          </Button>
          <Button type="button" variant="ghost" onClick={refreshStatus} disabled={busy === "load"}>
            <RefreshCw className="size-4" aria-hidden />
            {t("sync.refresh")}
          </Button>
          {status?.loggedIn ? (
            <Button
              type="button"
              variant="ghost"
              onClick={disconnect}
              disabled={busy === "disconnect"}
            >
              <LogOut className="size-4" aria-hidden />
              {t("sync.disconnect")}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-1 text-xs text-muted-foreground">
          {status?.lastSyncedAt ? (
            <span>{t("sync.lastSynced", { time: status.lastSyncedAt })}</span>
          ) : null}
          {message ? <span role="status">{message}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function errorMessage(
  err: unknown,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const message = err instanceof Error ? err.message : String(err)
  const key = syncErrorMessageKey(message)
  return key ? t(key) : t("sync.messages.unexpected", { detail: message })
}
