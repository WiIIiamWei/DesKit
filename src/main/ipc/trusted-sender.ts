export interface TrustedSenderOptions {
  appScheme: string
  appHost: string
  rendererDevUrl?: string
}

export function isTrustedSenderUrl(url: string, options: TrustedSenderOptions): boolean {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }

  if (target.protocol === `${options.appScheme}:` && target.hostname === options.appHost) {
    return true
  }
  if (options.rendererDevUrl) {
    return target.origin === new URL(options.rendererDevUrl).origin
  }
  return false
}
