/*
 * =========================================================
 * KIVANTA SCOUT
 * CHECK 2 OBSERVATION EXTRACTOR
 * =========================================================
 *
 * Check 2:
 *
 * "Your Key, Password & Sensitive Information"
 *
 *
 * PURPOSE
 *
 * Inspect the collected Check 2 source evidence for
 * materially important sensitive-information behavior.
 *
 *
 * IMPORTANT
 *
 * The evidence collection state is preserved here.
 *
 * That distinction matters because:
 *
 * - evidence_collected means every planned evidence file
 *   was successfully inspected
 *
 * - evidence_partial means at least one planned evidence
 *   file could not be inspected
 *
 * Scout may use complete evidence to make a scoped negative
 * observation such as:
 *
 * "No materially important sensitive-information handling
 * was observed within the inspected source scope."
 *
 * Partial evidence cannot support that same conclusion.
 */

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
  const evidenceStatus = evidence?.status ?? null;

  const supportedEvidenceState =
    evidenceStatus === "evidence_collected" ||
    evidenceStatus === "evidence_partial";

  /*
   * -------------------------------------------------------
   * EVIDENCE NOT AVAILABLE
   * -------------------------------------------------------
   */

  if (!supportedEvidenceState) {
    return {
      status: "observations_not_available",

      evidenceStatus,

      evidenceComplete: false,

      observationCount: 0,

      observations: [],
    };
  }

  /*
   * -------------------------------------------------------
   * INSPECT AVAILABLE FILES
   * -------------------------------------------------------
   */

  const observations = [];

  const files = Array.isArray(evidence.files) ? evidence.files : [];

  for (const file of files) {
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

        /*
         * Storage, transmission, and exposure behavior can
         * be materially sensitive even when the sensitive
         * identifier appears on a nearby line.
         */

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

          label,

          sensitive,

          excerpt: safeExcerpt(line, sensitive),
        });
      }
    });
  }

  /*
   * -------------------------------------------------------
   * RESULT
   * -------------------------------------------------------
   *
   * Preserve evidence completeness even when there are
   * zero observations.
   */

  return {
    status:
      observations.length > 0 ? "observations_found" : "no_observations_found",

    evidenceStatus,

    evidenceComplete: evidenceStatus === "evidence_collected",

    observationCount: observations.length,

    observations,
  };
}
