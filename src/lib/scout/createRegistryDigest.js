import { referenceRegistry } from "./referenceRegistry.js";

/*
 * Turn JSON-compatible data into a stable string.
 *
 * Object keys are sorted so the fingerprint
 * does not depend on how properties happen
 * to be ordered in the source file.
 *
 * We version this format because historical
 * Scout reviews must remain reproducible.
 */
function canonicalize(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Registry contains a non-finite number.");
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalize(item)).join(",") + "]";
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).sort();

    const entries = keys.map((key) => {
      const item = value[key];

      if (item === undefined) {
        throw new Error(`Registry contains undefined at "${key}".`);
      }

      return JSON.stringify(key) + ":" + canonicalize(item);
    });

    return "{" + entries.join(",") + "}";
  }

  throw new Error("Registry contains a value that cannot be canonicalized.");
}

/*
 * Create the SHA-256 fingerprint for the
 * exact reference registry configuration.
 *
 * Uses Web Crypto so the same approach works
 * in modern Node.js and Cloudflare Workers.
 */
export async function createRegistryDigest(registry = referenceRegistry) {
  const canonicalJson = canonicalize(registry);

  const bytes = new TextEncoder().encode(canonicalJson);

  const digestBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  const digest = Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    algorithm: "SHA-256",

    canonicalization: "scout-stable-json-v1",

    value: digest,
  };
}
