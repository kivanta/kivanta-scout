import { createPublicClient, http } from "viem";

import { mainnet } from "viem/chains";

import { normalize } from "viem/ens";

const defaultClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const RECORD_KEYS = ["url", "com.github", "vnd.github"];

export async function resolveEnsDiscoveryRecords(
  name,
  { client = defaultClient } = {},
) {
  if (typeof name !== "string" || !name.toLowerCase().endsWith(".eth")) {
    return {
      status: "ens_records_not_available",

      reason: "invalid_ens_name",

      records: {},
    };
  }

  let normalizedName;

  try {
    normalizedName = normalize(name);
  } catch {
    return {
      status: "ens_records_not_available",

      reason: "invalid_ens_name",

      records: {},
    };
  }

  const results = await Promise.all(
    RECORD_KEYS.map(async (key) => {
      try {
        const value = await client.getEnsText({
          name: normalizedName,

          key: key,
        });

        return {
          key: key,

          value: typeof value === "string" ? value.trim() : "",
        };
      } catch {
        return {
          key: key,

          value: "",

          error: true,
        };
      }
    }),
  );

  const recordMap = Object.fromEntries(
    results.map((result) => [result.key, result.value]),
  );

  const githubHandle =
    recordMap["com.github"] || recordMap["vnd.github"] || null;

  const githubKey = recordMap["com.github"]
    ? "com.github"
    : recordMap["vnd.github"]
      ? "vnd.github"
      : null;

  const url = recordMap.url || null;

  const evidence = results
    .filter((result) => result.value)
    .map((result) => ({
      type: "ens_text_record",

      name: normalizedName,

      key: result.key,

      value: result.value,
    }));

  return {
    status: url || githubHandle ? "ens_records_found" : "ens_records_empty",

    name: normalizedName,

    records: {
      url: url,

      githubHandle: githubHandle,

      githubKey: githubKey,
    },

    evidence: evidence,
  };
}
