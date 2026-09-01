const SENSITIVE_TERMS =
  /\b(private[_-]?key|secret|password|passwd|token|credential|seed|mnemonic|api[_-]?key)\b/i;

const RULES = [
  {
    category: "input",
    label: "environment_read",
    pattern: /\b(os\.getenv|os\.environ|environ\.get)\b/,
  },

  {
    category: "storage",
    label: "file_access",
    pattern: /\b(open\s*\(|write\s*\(|json\.dump|pickle\.dump)\b/i,
  },

  {
    category: "transmission",
    label: "network_request",
    pattern: /\b(requests\.|httpx\.|aiohttp\.|urllib\.|urlopen\s*\()/i,
  },

  {
    category: "exposure",
    label: "console_output",
    pattern: /\b(print\s*\(|logging\.|logger\.)/i,
  },

  {
    category: "process",
    label: "subprocess",
    pattern: /\b(subprocess\.|os\.system\s*\()/i,
  },

  {
    category: "sensitive_reference",
    label: "sensitive_identifier",
    pattern: SENSITIVE_TERMS,
  },
];

function isCommentOnly(line) {
  return line.trim().startsWith("#");
}

function containsSensitiveTerm(line) {
  return SENSITIVE_TERMS.test(line);
}

function safeExcerpt(line, sensitive) {
  if (sensitive) {
    return "[sensitive value redacted]";
  }

  return line.trim().slice(0, 200);
}

function nearbySensitiveLine(lines, startIndex, distance = 4) {
  const endIndex = Math.min(lines.length - 1, startIndex + distance);

  for (let index = startIndex; index <= endIndex; index += 1) {
    const line = lines[index];

    if (!isCommentOnly(line) && containsSensitiveTerm(line)) {
      return true;
    }
  }

  return false;
}

export function extractCheck2Observations(evidence) {
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

      const lineIsSensitive = containsSensitiveTerm(line);

      for (const rule of RULES) {
        if (!rule.pattern.test(line)) {
          continue;
        }

        let sensitive = lineIsSensitive;
        let label = rule.label;

        if (
          (rule.category === "transmission" ||
            rule.category === "storage" ||
            rule.category === "exposure") &&
          !sensitive
        ) {
          sensitive = nearbySensitiveLine(lines, index, 4);

          if (sensitive) {
            label = `sensitive_${rule.label}`;
          }
        }

        observations.push({
          path: file.path,
          line: index + 1,
          category: rule.category,
          label: label,
          sensitive: sensitive,
          excerpt: safeExcerpt(line, sensitive),
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
