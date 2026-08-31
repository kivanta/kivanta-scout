const RULES = [
  {
    category: "technocore",
    label: "technocore_host",
    pattern: /technocore\.chat/i,
  },
  {
    category: "technocore",
    label: "room_endpoint",
    pattern: /\/r\//,
  },
  {
    category: "technocore",
    label: "kv_endpoint",
    pattern: /\/kv\//,
  },
  {
    category: "identity",
    label: "did_key",
    pattern: /did:key:/i,
  },
  {
    category: "signing",
    label: "ed25519",
    pattern: /ed25519/i,
  },
  {
    category: "network",
    label: "http_request",
    pattern:
      /\b(requests\.|httpx\.|urllib\.|aiohttp\.|urlopen\s*\(|http\.client)/i,
  },
  {
    category: "configuration",
    label: "environment_variable",
    pattern: /\b(os\.getenv|os\.environ|environ\.get)\b/,
  },
  {
    category: "filesystem",
    label: "file_access",
    pattern: /\bopen\s*\(/,
  },
  {
    category: "process",
    label: "subprocess",
    pattern: /\b(subprocess\.|os\.system\s*\()/,
  },
  {
    category: "entry_point",
    label: "python_main",
    pattern: /__name__\s*==\s*["']__main__["']/,
  },
];

function cleanLine(line) {
  return line.trim().slice(0, 240);
}

function isCommentOnly(line) {
  return line.trim().startsWith("#");
}

export function extractCheck1Observations(evidence) {
  if (
    evidence.status !== "evidence_collected" &&
    evidence.status !== "evidence_partial"
  ) {
    return {
      status: "observations_not_available",
      observations: [],
    };
  }

  const observations = [];

  for (const file of evidence.files) {
    if (file.status !== "file_found" || !file.content) {
      continue;
    }

    const lines = file.content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (isCommentOnly(line)) {
        return;
      }

      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          observations.push({
            path: file.path,
            line: index + 1,
            category: rule.category,
            label: rule.label,
            excerpt: cleanLine(line),
          });
        }
      }
    });
  }

  return {
    status:
      observations.length > 0 ? "observations_found" : "no_observations_found",

    observationCount: observations.length,

    observations: observations,
  };
}
