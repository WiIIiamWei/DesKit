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
  it("derives opposite display codes so each device must enter the peer code", () => {
    const initiator = new SasPairingManager(alice, () => 10)
    const responder = new SasPairingManager(bob, () => 10)
    const draft = initiator.createOutgoingDraft()
    const challenge = responder.acceptIncomingCommitment(draft.commitment)
    const outgoing = draft.complete(challenge)
    const incoming = responder.acceptIncomingReveal(challenge.id, outgoing.reveal)

    expect(outgoing.pairing.sas).toMatch(/^\d{6}$/)
    expect(incoming.sas).toMatch(/^\d{6}$/)
    expect(incoming.sas).not.toBe(outgoing.pairing.sas)
    expect(() => initiator.prepareLocalConfirmation(challenge.id, "000000")).toThrow(
      "Security code is incorrect."
    )
    expect(() => initiator.prepareLocalConfirmation(challenge.id, outgoing.pairing.sas)).toThrow(
      "Security code is incorrect."
    )
    expect(() => responder.prepareLocalConfirmation(challenge.id, incoming.sas)).toThrow(
      "Security code is incorrect."
    )
    expect(initiator.prepareLocalConfirmation(challenge.id, incoming.sas)).toMatchObject({
      deviceId: "bob",
    })
    expect(responder.prepareLocalConfirmation(challenge.id, outgoing.pairing.sas)).toMatchObject({
      deviceId: "alice",
    })
    expect(initiator.markLocalConfirmed(challenge.id)).toBeNull()
    expect(responder.markPeerConfirmed(challenge.id)).toBeNull()
    expect(responder.markLocalConfirmed(challenge.id)).toMatchObject({ deviceId: "alice" })
    expect(initiator.markPeerConfirmed(challenge.id)).toMatchObject({ deviceId: "bob" })
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
