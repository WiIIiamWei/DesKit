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
  if (/ERR_TUNNEL_CONNECTION_FAILED/i.test(message)) {
    return "sync.messages.network.proxyFailed"
  }
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/i.test(message)) {
    return "sync.messages.network.offline"
  }
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return "sync.messages.network.dnsFailed"
  }
  if (/ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|timed out/i.test(message)) {
    return "sync.messages.network.timeout"
  }
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(message)) {
    return "sync.messages.network.refused"
  }
  if (/ERR_CERT_|certificate/i.test(message)) {
    return "sync.messages.network.certificate"
  }
  if (/401|Bad credentials|GitHub is not connected/i.test(message)) {
    return "sync.messages.authExpired"
  }
  if (/404|Gist was not found|Unable to read GitHub Gist/i.test(message)) {
    return "sync.messages.gistNotFound"
  }
  if (/Gist cannot be updated/i.test(message)) {
    return "sync.messages.gistNotWritable"
  }
  if (/403|rate limit/i.test(message)) {
    return "sync.messages.githubForbidden"
  }
  if (/invalid JSON|invalid sync payload|Unsupported sync payload/i.test(message)) {
    return "sync.messages.invalidRemoteData"
  }
  if (/Failed to fetch|fetch failed|network/i.test(message)) {
    return "sync.messages.network.generic"
  }
  return null
}
