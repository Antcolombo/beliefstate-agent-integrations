import assert from "node:assert/strict";
import { canonicalJsonHash } from "../shared/canonical-json.mjs";

const decode = (value) => {
  assert(
    typeof value === "string" && value.length <= 4096,
    "Invalid recovery proof.",
  );
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
};
export function researchScope(request) {
  const url = new URL(request.url);
  assert.equal(
    url.origin,
    "https://beliefstate.ai",
    "Unexpected research origin.",
  );
  assert.equal(request.method, "POST", "Unexpected research method.");
  const path = url.pathname;
  const tool = path.split("/").at(-1);
  assert.equal(path, `/v1/research/${tool}`, "Unexpected research path.");
  assert(
    ["get_brief", "get_case", "get_belief"].includes(tool),
    "Unexpected research operation.",
  );
  return `POST ${path} research-x402-${tool}-v1 8453 20000 ${canonicalJsonHash({ method: "POST", url: request.url, args: JSON.parse(request.body) })}`;
}
function subject(operation, expiresAt) {
  const payment = JSON.parse(
    Buffer.from(operation.paymentSignature, "base64").toString("utf8"),
  );
  const auth = payment.payload.authorization;
  assert.equal(
    operation.quote.extensions?.mppx?.info?._mppx_scope,
    researchScope(operation.request),
    "Quoted request binding changed.",
  );
  const purchase = `x402_${canonicalJsonHash([payment.accepted.network, payment.accepted.asset.toLowerCase(), auth.from.toLowerCase(), auth.nonce.toLowerCase()])}`;
  return {
    payer: auth.from.toLowerCase(),
    message: [
      "BeliefState x402 response recovery",
      `Origin: ${new URL(operation.request.url).origin}`,
      `Network: ${payment.accepted.network}`,
      `Recipient: ${auth.to.toLowerCase()}`,
      `Purchase: ${purchase}`,
      `Scope: ${researchScope(operation.request)}`,
      `Expires: ${expiresAt}`,
    ].join("\n"),
  };
}
function expiry(value) {
  const now = Math.floor(Date.now() / 1000);
  assert(
    Number.isSafeInteger(value) && value > now && value <= now + 300,
    "Recovery proof has an invalid expiration.",
  );
}
export async function signRecoveryMessage(message) {
  const key = process.env.PAYMENT_WALLET_PRIVATE_KEY;
  assert(
    /^0x[0-9a-fA-F]{64}$/.test(key ?? ""),
    "Recovery requires the original paying wallet through your secret store.",
  );
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(key).signMessage({ message });
}
export async function makeRecoveryProof(operation, signMessage, challenge) {
  const expires_at =
    challenge?.expires_at ?? Math.floor(Date.now() / 1000) + 300;
  expiry(expires_at);
  const expected = subject(operation, expires_at);
  if (challenge)
    assert.equal(
      challenge.message,
      expected.message,
      "Recovery challenge does not match the saved purchase.",
    );
  const signature = await signMessage(expected.message);
  const proof = Buffer.from(JSON.stringify({ expires_at, signature })).toString(
    "base64",
  );
  await verifyRecoveryProof(operation, proof);
  return proof;
}
export async function verifyRecoveryProof(operation, encoded) {
  const proof = decode(encoded);
  expiry(proof.expires_at);
  assert(
    /^0x[0-9a-fA-F]{130}$/.test(proof.signature ?? ""),
    "Invalid recovery signature.",
  );
  const expected = subject(operation, proof.expires_at);
  const { recoverMessageAddress } = await import("viem");
  assert.equal(
    (
      await recoverMessageAddress({
        message: expected.message,
        signature: proof.signature,
      })
    ).toLowerCase(),
    expected.payer,
    "Recovery wallet differs from the original payer.",
  );
}
export function recoveryChallenge(encoded) {
  const challenge = decode(encoded);
  expiry(challenge.expires_at);
  assert(typeof challenge.message === "string", "Missing recovery challenge.");
  return challenge;
}
