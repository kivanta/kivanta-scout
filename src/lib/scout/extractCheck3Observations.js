const SENSITIVE_TERMS =
  /\b(private[_-]?key|secret|password|passwd|token|credential|seed|mnemonic|api[_-]?key)\b/i;

const RULES = [
  {
    category: "http",
    label: "http_client",
    pattern:
      /\b(requests\.|httpx\.|aiohttp\.|urllib\.|urlopen\s*\(|http\.client)/i,
  },

  {
    category: "websocket",
    label: "websocket_client",
    pattern: /\b(websocket|websockets\.|ws:\/\/|wss:\/\/)/i,
  },

  {
    category: "socket",
    label: "socket_connection",
    pattern: /\b(socket\.socket|socket\.create_connection|connect\s*\()/i,
  },

  {
    category: "rpc",
    label: "rpc_reference",
    pattern: /\b(rpc|jsonrpc|json-rpc)\b/i,
  },

  {
    category: "endpoint",
    label: "http_url",
    pattern: /https?:\/\/[^\s"'`)\]}]+/i,
  },

  {
    category: "endpoint",
    label: "websocket_url",
    pattern: /wss?:\/\/[^\s"'`)\]}]+/i,
  },

  {
    category: "configuration",
    label: "environment_endpoint",
    pattern: /\b(os\.getenv|os\.environ|environ\.get)\b/,
  },

  {
    category: "process",
    label: "network_capable_process",
    pattern: /\b(subprocess\.|os\.system\s*\()/i,
  },
];

function isCommentOnly(line) {
  return line.trim().startsWith("#");
}

function safeExcerpt(line) {
  if (SENSITIVE_TERMS.test(line)) {
    return "[potentially sensitive value redacted]";
  }

  return line.trim().slice(0, 220);
}

function extractUrls(line) {
  const matches = line.match(/\b(?:https?|wss?):\/\/[^\s"'`)\]}]+/gi);

  return matches || [];
}

export function extractCheck3Observations(evidence) {
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
        if (!rule.pattern.test(line)) {
          continue;
        }

        observations.push({
          path: file.path,
          line: index + 1,
          category: rule.category,
          label: rule.label,
          destinations: extractUrls(line),
          excerpt: safeExcerpt(line),
        });
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
