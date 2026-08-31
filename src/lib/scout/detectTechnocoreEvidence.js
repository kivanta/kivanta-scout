export async function detectTechnocoreEvidence({ owner, repo, branch, items }) {
  const sourceFiles = items
    .filter((item) => {
      if (item.type !== "blob") {
        return false;
      }

      const path = item.path.toLowerCase();

      if (path.startsWith("tests/")) {
        return false;
      }

      return (
        path.endsWith(".py") || path.endsWith(".toml") || path.endsWith(".json")
      );
    })
    .slice(0, 40);

  const matches = [];

  for (const item of sourceFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;

    try {
      const response = await fetch(rawUrl);

      if (!response.ok) {
        continue;
      }

      const content = await response.text();
      const lower = content.toLowerCase();

      const signals = [];

      if (lower.includes("technocore.chat")) {
        signals.push("technocore_host");
      }

      if (
        lower.includes("/r/") ||
        lower.includes("/r/{") ||
        lower.includes("/r/<")
      ) {
        signals.push("room_api");
      }

      if (
        lower.includes("/kv/") ||
        lower.includes("/kv/{") ||
        lower.includes("/kv/<")
      ) {
        signals.push("kv_api");
      }

      if (lower.includes("did:key:")) {
        signals.push("did_key");
      }

      if (lower.includes("say-signed")) {
        signals.push("signed_message_api");
      }

      if (signals.length > 0) {
        matches.push({
          path: item.path,
          signals: signals,
        });
      }
    } catch {
      continue;
    }
  }

  const allSignals = new Set(matches.flatMap((match) => match.signals));

  const hasHost = allSignals.has("technocore_host");

  const hasProtocol = allSignals.has("room_api") || allSignals.has("kv_api");

  const established = hasHost && hasProtocol;

  return {
    established: established,
    sourceFileCountChecked: sourceFiles.length,
    signals: [...allSignals],
    matches: matches,
  };
}
