import { describe, expect, it } from "vitest"
import { SasPairingManager } from "./sas-pairing"

const alice = {
  deviceId: "alice",
  name: "Alice",
  certificatePem: "alice-cert",
  certificateFingerprint: "alice-fingerprint",
}
const bob = {
  deviceId: "bob",
  name: "Bob",
  certificatePem: "bob-cert",
  certificateFingerprint: "bob-fingerprint",
}

describe("sasPairingManager", () => {
  it("derives the same SAS on both devices after commit and reveal", () => {
    const initiator = new SasPairingManager(alice, () => 10)
    const responder = new SasPairingManager(bob, () => 10)
    const draft = initiator.createOutgoingDraft()
    const challenge = responder.acceptIncomingCommitment(draft.commitment)
    const outgoing = draft.complete(challenge)
    const incoming = responder.acceptIncomingReveal(challenge.id, outgoing.reveal)

    expect(outgoing.pairing.sas).toMatch(/^\d{6}$/)
    expect(incoming.sas).toBe(outgoing.pairing.sas)
    expect(initiator.confirm(challenge.id)).toMatchObject({ deviceId: "bob" })
    expect(responder.confirm(challenge.id)).toMatchObject({ deviceId: "alice" })
  })

  it("rejects a reveal that does not match the commitment", () => {
    const initiator = new SasPairingManager(alice)
    const responder = new SasPairingManager(bob)
    const draft = initiator.createOutgoingDraft()
    const challenge = responder.acceptIncomingCommitment(draft.commitment)
    const outgoing = draft.complete(challenge)

    expect(() =>
      responder.acceptIncomingReveal(challenge.id, {
        ...outgoing.reveal,
        initiatorNonce: "tampered",
      })
    ).toThrow("Pairing commitment does not match reveal.")
  })
})
