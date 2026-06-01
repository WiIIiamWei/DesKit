export function nextGitHubLoginPollInterval(current: number): number {
  return current + 5
}

export function syncErrorMessageKey(message: string): string | null {
  if (/SyncDecryptionError|Unable to decrypt sync payload/i.test(message)) {
    return "sync.messages.decryptFailed"
  }
  if (/Sync passphrase is required/i.test(message)) {
    return "sync.messages.passphraseRequired"
  }
  return null
}
