import type { Buffer } from "node:buffer"
import type { KeyObject } from "node:crypto"
import type { LanPairing, LanPairingDirection, TrustedLanDevice } from "./types"
import {
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto"

const PAIRING_TTL_MS = 5 * 60 * 1000

export interface PairingIdentity {
  deviceId: string
  name: string
  certificatePem: string
  certificateFingerprint: string
}

export interface PairingCommitment {
  commitment: string
  endpointPort?: number
  identity: PairingIdentity
}

export interface PresenceAnnouncement {
  endpointPort: number
  identity: PairingIdentity
}

export interface PairingChallenge {
  id: string
  responderIdentity: PairingIdentity
  responderPublicKey: string
  responderNonce: string
}

export interface PairingReveal {
  initiatorPublicKey: string
  initiatorNonce: string
}

interface PairingSession extends LanPairing {
  expectedSas: string
  localConfirmed: boolean
  peerIdentity: PairingIdentity
  peerConfirmed: boolean
}

interface PendingIncoming {
  id: string
  createdAt: number
  commitment: string
  peerIdentity: PairingIdentity
  responderKey: KeyObject
  responderPublicKey: string
  responderNonce: string
}

export interface OutgoingPairingDraft {
  commitment: PairingCommitment
  complete: (challenge: PairingChallenge) => { pairing: LanPairing; reveal: PairingReveal }
}

export interface OutgoingPairingDraftOptions {
  endpointPort?: number
}

export class SasPairingManager {
  private readonly sessions = new Map<string, PairingSession>()
  private readonly incoming = new Map<string, PendingIncoming>()

  constructor(
    private readonly localIdentity: PairingIdentity,
    private readonly now = Date.now
  ) {}

  createOutgoingDraft(options: OutgoingPairingDraftOptions = {}): OutgoingPairingDraft {
    const { privateKey, publicKey } = generateX25519KeyPair()
    const initiatorPublicKey = exportPublicKey(publicKey)
    const initiatorNonce = randomBytes(32).toString("base64")
    return {
      commitment: {
        identity: this.localIdentity,
        commitment: pairingCommitment(initiatorPublicKey, initiatorNonce),
        endpointPort: options.endpointPort,
      },
      complete: (challenge) => {
        const codes = deriveSasCodes({
          initiatorPublicKey,
          initiatorNonce,
          responderPublicKey: challenge.responderPublicKey,
          responderNonce: challenge.responderNonce,
          initiatorFingerprint: this.localIdentity.certificateFingerprint,
          responderFingerprint: challenge.responderIdentity.certificateFingerprint,
          sharedSecret: diffieHellman({
            privateKey,
            publicKey: importPublicKey(challenge.responderPublicKey),
          }),
        })
        const pairing = this.saveSession(
          challenge.id,
          "outgoing",
          challenge.responderIdentity,
          codes.initiatorCode,
          codes.responderCode
        )
        return {
          pairing,
          reveal: { initiatorPublicKey, initiatorNonce },
        }
      },
    }
  }

  acceptIncomingCommitment(value: PairingCommitment): PairingChallenge {
    this.prune()
    const id = randomUUID()
    const { privateKey, publicKey } = generateX25519KeyPair()
    const pending: PendingIncoming = {
      id,
      createdAt: this.now(),
      commitment: value.commitment,
      peerIdentity: value.identity,
      responderKey: privateKey,
      responderPublicKey: exportPublicKey(publicKey),
      responderNonce: randomBytes(32).toString("base64"),
    }
    this.incoming.set(id, pending)
    return {
      id,
      responderIdentity: this.localIdentity,
      responderPublicKey: pending.responderPublicKey,
      responderNonce: pending.responderNonce,
    }
  }

  acceptIncomingReveal(id: string, reveal: PairingReveal): LanPairing {
    this.prune()
    const pending = this.incoming.get(id)
    if (!pending) throw new Error("Pairing request expired or was not found.")
    if (
      pairingCommitment(reveal.initiatorPublicKey, reveal.initiatorNonce) !== pending.commitment
    ) {
      throw new Error("Pairing commitment does not match reveal.")
    }
    const codes = deriveSasCodes({
      ...reveal,
      responderPublicKey: pending.responderPublicKey,
      responderNonce: pending.responderNonce,
      initiatorFingerprint: pending.peerIdentity.certificateFingerprint,
      responderFingerprint: this.localIdentity.certificateFingerprint,
      sharedSecret: diffieHellman({
        privateKey: pending.responderKey,
        publicKey: importPublicKey(reveal.initiatorPublicKey),
      }),
    })
    const pairing = this.saveSession(
      pending.id,
      "incoming",
      pending.peerIdentity,
      codes.responderCode,
      codes.initiatorCode
    )
    this.incoming.delete(id)
    return pairing
  }

  list(): LanPairing[] {
    this.prune()
    return [...this.sessions.values()].map(toPublicPairing)
  }

  get(id: string): LanPairing | null {
    const session = this.sessions.get(id)
    return session ? toPublicPairing(session) : null
  }

  peerFingerprint(id: string): string {
    return this.requireAwaiting(id).peerIdentity.certificateFingerprint
  }

  prepareLocalConfirmation(id: string, sas: string): TrustedLanDevice {
    const session = this.requireAwaiting(id)
    if (session.expectedSas !== sas) throw new Error("Security code is incorrect.")
    return this.toTrustedDevice(session)
  }

  markLocalConfirmed(id: string): TrustedLanDevice | null {
    const session = this.requireAwaiting(id)
    session.localConfirmed = true
    return this.completeIfBothConfirmed(session)
  }

  markPeerConfirmed(id: string): TrustedLanDevice | null {
    const session = this.requireAwaiting(id)
    session.peerConfirmed = true
    return this.completeIfBothConfirmed(session)
  }

  reject(id: string): void {
    const session = this.sessions.get(id)
    if (!session || session.state !== "awaiting-confirmation") return
    session.state = "rejected"
  }

  private saveSession(
    id: string,
    direction: LanPairingDirection,
    peerIdentity: PairingIdentity,
    sas: string,
    expectedSas: string
  ): LanPairing {
    const session: PairingSession = {
      id,
      direction,
      deviceId: peerIdentity.deviceId,
      deviceName: peerIdentity.name,
      expectedSas,
      peerIdentity,
      sas,
      state: "awaiting-confirmation",
      localConfirmed: false,
      peerConfirmed: false,
      createdAt: this.now(),
    }
    this.sessions.set(id, session)
    return toPublicPairing(session)
  }

  private requireAwaiting(id: string, direction?: LanPairingDirection): PairingSession {
    const session = this.sessions.get(id)
    if (
      !session ||
      session.state !== "awaiting-confirmation" ||
      (direction && session.direction !== direction)
    ) {
      throw new Error("Pairing request is no longer awaiting confirmation.")
    }
    return session
  }

  private toTrustedDevice(session: PairingSession): TrustedLanDevice {
    return {
      ...session.peerIdentity,
      pairedAt: this.now(),
    }
  }

  private completeIfBothConfirmed(session: PairingSession): TrustedLanDevice | null {
    if (!session.localConfirmed || !session.peerConfirmed) return null
    session.state = "confirmed"
    return this.toTrustedDevice(session)
  }

  private prune(): void {
    const expiresBefore = this.now() - PAIRING_TTL_MS
    for (const [id, pending] of this.incoming) {
      if (pending.createdAt < expiresBefore) this.incoming.delete(id)
    }
    for (const [id, session] of this.sessions) {
      if (session.createdAt < expiresBefore && session.state === "awaiting-confirmation") {
        this.sessions.delete(id)
      }
    }
  }
}

export function pairingCommitment(publicKey: string, nonce: string): string {
  return createHash("sha256").update(`${publicKey}\n${nonce}`).digest("hex")
}

interface SasInput extends PairingReveal {
  responderPublicKey: string
  responderNonce: string
  initiatorFingerprint: string
  responderFingerprint: string
  sharedSecret: Buffer
}

export function deriveSasCodes(input: SasInput): { initiatorCode: string; responderCode: string } {
  const transcript = [
    "deskit-lan-pairing-v1",
    input.initiatorPublicKey,
    input.initiatorNonce,
    input.responderPublicKey,
    input.responderNonce,
    input.initiatorFingerprint,
    input.responderFingerprint,
  ].join("\n")
  const initiatorCode = deriveDisplayCode(input.sharedSecret, transcript, "initiator-display")
  let responderCode = deriveDisplayCode(input.sharedSecret, transcript, "responder-display")
  if (responderCode === initiatorCode) responderCode = nextDisplayCode(responderCode)
  return { initiatorCode, responderCode }
}

function deriveDisplayCode(sharedSecret: Buffer, transcript: string, label: string): string {
  const value = createHmac("sha256", sharedSecret)
    .update(`${label}\n${transcript}`)
    .digest()
    .readUInt32BE(0)
  return String(value % 1_000_000).padStart(6, "0")
}

function nextDisplayCode(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, "0")
}

function generateX25519KeyPair(): { privateKey: KeyObject; publicKey: KeyObject } {
  return generateKeyPairSync("x25519")
}

function exportPublicKey(publicKey: KeyObject): string {
  return publicKey.export({ format: "pem", type: "spki" }).toString()
}

function importPublicKey(publicKey: string): KeyObject {
  return createPublicKey(publicKey)
}

function toPublicPairing(session: PairingSession): LanPairing {
  return {
    id: session.id,
    direction: session.direction,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    sas: session.sas,
    state: session.state,
    localConfirmed: session.localConfirmed,
    peerConfirmed: session.peerConfirmed,
    createdAt: session.createdAt,
  }
}
