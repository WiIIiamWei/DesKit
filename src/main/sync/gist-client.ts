const GITHUB_API_URL = "https://api.github.com"
const GITHUB_LOGIN_URL = "https://github.com"
export const DESKIT_SYNC_GIST_FILENAME = "deskit-sync.json"

export interface GitHubDeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface GitHubDeviceToken {
  accessToken: string
  scope: string
  tokenType: string
}

export interface GitHubUser {
  login: string
  id: number
}

export interface GistFile {
  filename: string
  content?: string
  rawUrl?: string
}

export interface GistSummary {
  id: string
  description?: string
  updatedAt: string
  files: Record<string, GistFile>
}

export interface GitHubGistClientOptions {
  fetch?: typeof fetch
  apiUrl?: string
  loginUrl?: string
}

export class GitHubGistClientError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message)
    this.name = "GitHubGistClientError"
    this.status = options.status
    this.code = options.code
  }
}

export class GitHubGistClient {
  private readonly fetchImpl: typeof fetch
  private readonly apiUrl: string
  private readonly loginUrl: string

  constructor(options: GitHubGistClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.apiUrl = options.apiUrl ?? GITHUB_API_URL
    this.loginUrl = options.loginUrl ?? GITHUB_LOGIN_URL
  }

  async startDeviceAuthorization(clientId: string): Promise<GitHubDeviceAuthorization> {
    const body = new URLSearchParams({
      client_id: requireNonEmpty(clientId, "clientId"),
      scope: "gist",
    })
    const response = await this.fetchImpl(`${this.loginUrl}/login/device/code`, {
      method: "POST",
      headers: acceptJsonHeaders(),
      body,
    })
    const data = await readJsonObject(response)
    if (!response.ok) throw githubError(response, data, "Unable to start GitHub device flow")
    return {
      deviceCode: requireString(data.device_code, "device_code"),
      userCode: requireString(data.user_code, "user_code"),
      verificationUri: requireString(data.verification_uri, "verification_uri"),
      expiresIn: requireNumber(data.expires_in, "expires_in"),
      interval: typeof data.interval === "number" ? data.interval : 5,
    }
  }

  async pollDeviceToken(clientId: string, deviceCode: string): Promise<GitHubDeviceToken> {
    const body = new URLSearchParams({
      client_id: requireNonEmpty(clientId, "clientId"),
      device_code: requireNonEmpty(deviceCode, "deviceCode"),
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    })
    const response = await this.fetchImpl(`${this.loginUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: acceptJsonHeaders(),
      body,
    })
    const data = await readJsonObject(response)
    if ("error" in data) {
      throw new GitHubGistClientError(
        typeof data.error_description === "string"
          ? data.error_description
          : "GitHub device authorization is not ready",
        { code: typeof data.error === "string" ? data.error : undefined }
      )
    }
    if (!response.ok) throw githubError(response, data, "Unable to finish GitHub device flow")
    return {
      accessToken: requireString(data.access_token, "access_token"),
      scope: requireString(data.scope, "scope"),
      tokenType: requireString(data.token_type, "token_type"),
    }
  }

  async getAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
    const response = await this.fetchImpl(`${this.apiUrl}/user`, {
      headers: authHeaders(accessToken),
    })
    const data = await readJsonObject(response)
    if (!response.ok) throw githubError(response, data, "Unable to read GitHub user")
    return {
      login: requireString(data.login, "login"),
      id: requireNumber(data.id, "id"),
    }
  }

  async findSyncGist(accessToken: string): Promise<GistSummary | null> {
    let newest: GistSummary | null = null
    for (let page = 1; page <= 10; page += 1) {
      const response = await this.fetchImpl(`${this.apiUrl}/gists?per_page=100&page=${page}`, {
        headers: authHeaders(accessToken),
      })
      const data = await readJson(response)
      if (!response.ok) throw githubError(response, data, "Unable to list GitHub Gists")
      if (!Array.isArray(data)) throw new GitHubGistClientError("GitHub Gists response is invalid")
      for (const item of data) {
        const gist = parseGistSummary(item)
        if (!gist.files[DESKIT_SYNC_GIST_FILENAME]) continue
        if (!newest || Date.parse(gist.updatedAt) > Date.parse(newest.updatedAt)) newest = gist
      }
      if (!hasNextPage(response)) break
    }
    return newest ? this.getGist(accessToken, newest.id) : null
  }

  async getGist(accessToken: string, gistId: string): Promise<GistSummary> {
    const response = await this.fetchImpl(
      `${this.apiUrl}/gists/${requireNonEmpty(gistId, "gistId")}`,
      {
        headers: authHeaders(accessToken),
      }
    )
    const data = await readJsonObject(response)
    if (!response.ok) throw githubError(response, data, "Unable to read GitHub Gist")
    return parseGistSummary(data)
  }

  async createSyncGist(accessToken: string, content: string): Promise<GistSummary> {
    const response = await this.fetchImpl(`${this.apiUrl}/gists`, {
      method: "POST",
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        description: "DesKit encrypted settings sync",
        public: false,
        files: {
          [DESKIT_SYNC_GIST_FILENAME]: { content },
        },
      }),
    })
    const data = await readJsonObject(response)
    if (!response.ok) throw githubError(response, data, "Unable to create GitHub Gist")
    return parseGistSummary(data)
  }

  async updateSyncGist(accessToken: string, gistId: string, content: string): Promise<GistSummary> {
    const response = await this.fetchImpl(
      `${this.apiUrl}/gists/${requireNonEmpty(gistId, "gistId")}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          files: {
            [DESKIT_SYNC_GIST_FILENAME]: { content },
          },
        }),
      }
    )
    const data = await readJsonObject(response)
    if (!response.ok) throw githubError(response, data, "Unable to update GitHub Gist")
    return parseGistSummary(data)
  }
}

function acceptJsonHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${requireNonEmpty(accessToken, "accessToken")}`,
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

function jsonAuthHeaders(accessToken: string): Record<string, string> {
  return {
    ...authHeaders(accessToken),
    "Content-Type": "application/json",
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | unknown[]> {
  const text = await response.text()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as Record<string, unknown> | unknown[]
  } catch {
    throw new GitHubGistClientError("GitHub response is not valid JSON", {
      status: response.status,
    })
  }
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const data = await readJson(response)
  if (Array.isArray(data)) throw new GitHubGistClientError("GitHub response is invalid")
  return data
}

function githubError(
  response: Response,
  data: Record<string, unknown> | unknown[],
  fallback: string
): GitHubGistClientError {
  const message = !Array.isArray(data) && typeof data.message === "string" ? data.message : fallback
  return new GitHubGistClientError(message, { status: response.status })
}

function parseGistSummary(value: unknown): GistSummary {
  if (!value || typeof value !== "object") throw new GitHubGistClientError("Gist is invalid")
  const raw = value as Record<string, unknown>
  const files = raw.files
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new GitHubGistClientError("Gist files are invalid")
  }
  return {
    id: requireString(raw.id, "id"),
    description: typeof raw.description === "string" ? raw.description : undefined,
    updatedAt: requireString(raw.updated_at, "updated_at"),
    files: parseGistFiles(files as Record<string, unknown>),
  }
}

function parseGistFiles(files: Record<string, unknown>): Record<string, GistFile> {
  const parsed: Record<string, GistFile> = {}
  for (const [name, file] of Object.entries(files)) {
    if (!file || typeof file !== "object" || Array.isArray(file)) continue
    const raw = file as Record<string, unknown>
    parsed[name] = {
      filename: typeof raw.filename === "string" ? raw.filename : name,
      content: typeof raw.content === "string" ? raw.content : undefined,
      rawUrl: typeof raw.raw_url === "string" ? raw.raw_url : undefined,
    }
  }
  return parsed
}

function hasNextPage(response: Response): boolean {
  return /\brel="next"/.test(response.headers.get("link") ?? "")
}

function requireNonEmpty(value: string, name: string): string {
  const clean = value.trim()
  if (!clean) throw new GitHubGistClientError(`${name} is required`)
  return clean
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GitHubGistClientError(`GitHub response is missing ${name}`)
  }
  return value
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GitHubGistClientError(`GitHub response is missing ${name}`)
  }
  return value
}
