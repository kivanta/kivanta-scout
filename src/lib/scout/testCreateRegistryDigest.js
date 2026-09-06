import { createRegistryDigest } from "./createRegistryDigest.js";

/*
 * Generate the fingerprint twice.
 *
 * Both values must be identical because the
 * same registry must always produce the same
 * fingerprint.
 */
const first = await createRegistryDigest();

const second = await createRegistryDigest();

console.log("\n===== REFERENCE REGISTRY DIGEST =====");

console.dir(first, {
  depth: null,
});

console.log("\n===== REPRODUCIBILITY CHECK =====");

console.log({
  sameDigest: first.value === second.value,
});
