import type { AppEntry } from "./types"
import { shell } from "electron"
import { dedupeEntries, scanStartMenuDir, startMenuDirectories } from "./scan-start-menu"
import { scanUwpApps } from "./scan-uwp"

/**
 * In-memory inventory of installed apps. Built in parallel from the two
 * sources PowerToys CmdPal also uses: Win32 shortcuts under the two
 * Start-menu roots, and packaged (UWP/MSIX) apps via Get-StartApps.
 */
export class AppCache {
  private apps: readonly AppEntry[] = []
  private refreshing: Promise<readonly AppEntry[]> | null = null

  list(): readonly AppEntry[] {
    return this.apps
  }

  /**
   * Returns the most recent successful scan. Concurrent calls share a
   * single in-flight refresh — we never want two simultaneous Start-menu
   * walks competing for the same disk.
   */
  async refresh(): Promise<readonly AppEntry[]> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.runRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async runRefresh(): Promise<readonly AppEntry[]> {
    const dirs = startMenuDirectories()
    const [uwp, ...win32Groups] = await Promise.all([
      scanUwpApps().catch(() => [] as AppEntry[]),
      ...dirs.map((dir) =>
        scanStartMenuDir(dir, { readShortcutLink: (p) => shell.readShortcutLink(p) }).catch(
          () => [] as AppEntry[]
        )
      ),
    ])
    const merged = dedupeEntries([...uwp, ...win32Groups.flat()])
    this.apps = merged
    return merged
  }
}
