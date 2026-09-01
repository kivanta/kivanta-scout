export async function buildTechnocoreDidNotePaths(did) {
  if (typeof did !== "string" || !did.startsWith("did:key:")) {
    return {
      status: "did_paths_not_available",
      reason: "invalid_did_key",
      paths: [],
    };
  }

  const bytes = new TextEncoder().encode(did);

  const digest = await crypto.subtle.digest("SHA-256", bytes);

  const fingerprint = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);

  const shard = fingerprint.slice(0, 2);

  const remainder = fingerprint.slice(2);

  return {
    status: "did_paths_ready",

    fingerprint: fingerprint,

    paths: [`/kv/did-${shard}/${remainder}`, `/kv/did/${fingerprint}`],
  };
}
