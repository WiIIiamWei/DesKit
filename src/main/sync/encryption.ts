import { Buffer } from "node:buffer"
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback)

export const SYNC_ENVELOPE_SCHEMA_VERSION = 1
const KEY_LENGTH_BYTES = 32
const IV_LENGTH_BYTES = 12
const SALT_LENGTH_BYTES = 16

export interface SyncEncryptionEnvelope {
  schemaVersion: typeof SYNC_ENVELOPE_SCHEMA_VERSION
  encryption: "scrypt+aes-256-gcm"
  kdf: {
    name: "scrypt"
    salt: string
    keyLength: typeof KEY_LENGTH_BYTES
  }
  cipher: {
    name: "aes-256-gcm"
    iv: string
    authTag: string
    ciphertext: string
  }
}

export class SyncDecryptionError extends Error {
  constructor(message = "Unable to decrypt sync payload") {
    super(message)
    this.name = "SyncDecryptionError"
  }
}

export async function encryptSyncPayload(
  payload: unknown,
  passphrase: string
): Promise<SyncEncryptionEnvelope> {
  const cleanPassphrase = normalizePassphrase(passphrase)
  const salt = randomBytes(SALT_LENGTH_BYTES)
  const iv = randomBytes(IV_LENGTH_BYTES)
  const key = await deriveKey(cleanPassphrase, salt)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    schemaVersion: SYNC_ENVELOPE_SCHEMA_VERSION,
    encryption: "scrypt+aes-256-gcm",
    kdf: {
      name: "scrypt",
      salt: salt.toString("base64"),
      keyLength: KEY_LENGTH_BYTES,
    },
    cipher: {
      name: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    },
  }
}

export async function decryptSyncPayload(envelope: unknown, passphrase: string): Promise<unknown> {
  const parsed = parseEnvelope(envelope)
  const cleanPassphrase = normalizePassphrase(passphrase)
  const salt = Buffer.from(parsed.kdf.salt, "base64")
  const iv = Buffer.from(parsed.cipher.iv, "base64")
  const authTag = Buffer.from(parsed.cipher.authTag, "base64")
  const ciphertext = Buffer.from(parsed.cipher.ciphertext, "base64")
  const key = await deriveKey(cleanPassphrase, salt)

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(plaintext.toString("utf-8")) as unknown
  } catch (err) {
    if (err instanceof SyntaxError)
      throw new SyncDecryptionError("Decrypted sync payload is invalid JSON")
    throw new SyncDecryptionError()
  }
}

function normalizePassphrase(passphrase: string): string {
  const clean = passphrase.trim()
  if (!clean) throw new SyncDecryptionError("Sync passphrase is required")
  return clean
}

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  const key = (await scrypt(passphrase, salt, KEY_LENGTH_BYTES)) as Buffer
  return Buffer.isBuffer(key) ? key : Buffer.from(key)
}

function parseEnvelope(value: unknown): SyncEncryptionEnvelope {
  if (!value || typeof value !== "object") throw new SyncDecryptionError("Invalid sync envelope")
  const envelope = value as Partial<SyncEncryptionEnvelope>
  if (envelope.schemaVersion !== SYNC_ENVELOPE_SCHEMA_VERSION) {
    throw new SyncDecryptionError("Unsupported sync envelope version")
  }
  if (envelope.encryption !== "scrypt+aes-256-gcm") {
    throw new SyncDecryptionError("Unsupported sync encryption")
  }
  if (
    !envelope.kdf ||
    envelope.kdf.name !== "scrypt" ||
    envelope.kdf.keyLength !== KEY_LENGTH_BYTES
  ) {
    throw new SyncDecryptionError("Unsupported sync key derivation")
  }
  if (!envelope.cipher || envelope.cipher.name !== "aes-256-gcm") {
    throw new SyncDecryptionError("Unsupported sync cipher")
  }
  requireBase64(envelope.kdf.salt, SALT_LENGTH_BYTES, "salt")
  requireBase64(envelope.cipher.iv, IV_LENGTH_BYTES, "iv")
  requireBase64(envelope.cipher.authTag, 16, "authTag")
  requireBase64(envelope.cipher.ciphertext, undefined, "ciphertext")
  return envelope as SyncEncryptionEnvelope
}

function requireBase64(value: unknown, expectedLength: number | undefined, name: string): void {
  if (typeof value !== "string" || !value) throw new SyncDecryptionError(`Invalid ${name}`)
  const decoded = Buffer.from(value, "base64")
  if (expectedLength !== undefined && decoded.byteLength !== expectedLength) {
    throw new SyncDecryptionError(`Invalid ${name}`)
  }
  const canonical = Buffer.from(decoded.toString("base64"))
  const original = Buffer.from(value)
  if (canonical.byteLength !== original.byteLength || !timingSafeEqual(canonical, original)) {
    throw new SyncDecryptionError(`Invalid ${name}`)
  }
}
