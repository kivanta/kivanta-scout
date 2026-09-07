/*
 * Test Create Hardened GitHub Request
 *
 * No real network calls.
 *
 * Every fetch is injected.
 */

import { createHardenedGitHubRequest } from "./createHardenedGitHubRequest.js";

/*
 * ------------------------------------------------
 * Tiny test helper
 * ------------------------------------------------
 */

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);

  return Boolean(condition);
}

const results = [];

/*
 * ------------------------------------------------
 * Test 1
 * API headers + authentication
 * ------------------------------------------------
 */

let observedApiRequest = null;

const authenticatedRequest = createHardenedGitHubRequest({
  token: "server-secret-token",

  fetchImpl: async (url, options) => {
    observedApiRequest = {
      url,

      options,
    };

    return new Response(
      JSON.stringify({
        ok: true,
      }),
      {
        status: 200,

        headers: {
          "content-type": "application/json",
        },
      },
    );
  },
});

const authenticatedResponse = await authenticatedRequest(
  "https://api.github.com/repos/kivanta/kivanta-scout",
);

const authenticatedBody = await authenticatedResponse.json();

const authenticatedHeaders = new Headers(observedApiRequest?.options?.headers);

results.push(
  check(
    "API request succeeds",
    authenticatedResponse.status === 200 && authenticatedBody.ok === true,
  ),
);

results.push(
  check(
    "GitHub Accept header applied",
    authenticatedHeaders.get("Accept") === "application/vnd.github+json",
  ),
);

results.push(
  check(
    "GitHub API version applied",
    authenticatedHeaders.get("X-GitHub-Api-Version") === "2026-03-10",
  ),
);

results.push(
  check(
    "server-side token applied to API host",
    authenticatedHeaders.get("Authorization") === "Bearer server-secret-token",
  ),
);

/*
 * ------------------------------------------------
 * Test 2
 * Token must NOT go to raw.githubusercontent.com
 * ------------------------------------------------
 */

let observedRawRequest = null;

const rawRequest = createHardenedGitHubRequest({
  token: "server-secret-token",

  fetchImpl: async (url, options) => {
    observedRawRequest = {
      url,

      options,
    };

    return new Response("print('hello')", {
      status: 200,
    });
  },
});

const rawResponse = await rawRequest(
  "https://raw.githubusercontent.com/kivanta/example/abc123/tool.py",
);

const rawText = await rawResponse.text();

const rawHeaders = new Headers(observedRawRequest?.options?.headers);

results.push(
  check("raw GitHub response remains readable", rawText === "print('hello')"),
);

results.push(
  check(
    "token not forwarded to raw GitHub host",
    rawHeaders.get("Authorization") === null,
  ),
);

results.push(
  check(
    "REST API version not added to raw GitHub host",
    rawHeaders.get("X-GitHub-Api-Version") === null,
  ),
);

/*
 * ------------------------------------------------
 * Test 3
 * HTTP rejected
 * ------------------------------------------------
 */

let httpRejected = false;

try {
  await authenticatedRequest(
    "http://api.github.com/repos/kivanta/kivanta-scout",
  );
} catch (error) {
  httpRejected = error?.code === "github_https_required";
}

results.push(check("non-HTTPS GitHub URL rejected", httpRejected));

/*
 * ------------------------------------------------
 * Test 4
 * Non-GitHub host rejected
 * ------------------------------------------------
 */

let hostRejected = false;

try {
  await authenticatedRequest("https://example.com/repos/kivanta/kivanta-scout");
} catch (error) {
  hostRejected = error?.code === "github_host_not_allowed";
}

results.push(check("non-GitHub host rejected", hostRejected));

/*
 * ------------------------------------------------
 * Test 5
 * Declared Content-Length too large
 * ------------------------------------------------
 */

const declaredLargeRequest = createHardenedGitHubRequest({
  fetchImpl: async () =>
    new Response("small-body", {
      status: 200,

      headers: {
        /*
         * Intentionally larger than the configured
         * maximum even though this fake body is small.
         */
        "content-length": "1000",
      },
    }),
});

let declaredLargeRejected = false;

try {
  await declaredLargeRequest(
    "https://api.github.com/repos/kivanta/kivanta-scout",
    {
      maxBytes: 100,
    },
  );
} catch (error) {
  declaredLargeRejected = error?.code === "github_response_too_large";
}

results.push(
  check("declared oversized response rejected", declaredLargeRejected),
);

/*
 * ------------------------------------------------
 * Test 6
 * Stream grows beyond maximum
 * ------------------------------------------------
 */

const streamedLargeRequest = createHardenedGitHubRequest({
  fetchImpl: async () =>
    new Response("1234567890", {
      status: 200,
    }),
});

let streamedLargeRejected = false;

try {
  await streamedLargeRequest(
    "https://raw.githubusercontent.com/kivanta/example/abc123/tool.py",
    {
      maxBytes: 5,
    },
  );
} catch (error) {
  streamedLargeRejected = error?.code === "github_response_too_large";
}

results.push(
  check("streamed oversized response rejected", streamedLargeRejected),
);

/*
 * ------------------------------------------------
 * Test 7
 * Response within bound stays usable
 * ------------------------------------------------
 */

const boundedRequest = createHardenedGitHubRequest({
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        sha: "abc123",
      }),
      {
        status: 200,

        headers: {
          "content-type": "application/json",
        },
      },
    ),
});

const boundedResponse = await boundedRequest(
  "https://api.github.com/repos/kivanta/example/commits/abc123",
  {
    maxBytes: 1024,
  },
);

const boundedJson = await boundedResponse.json();

results.push(
  check(
    "bounded response preserves normal Response API",
    boundedResponse.ok === true && boundedJson.sha === "abc123",
  ),
);

/*
 * ------------------------------------------------
 * Test 8
 * Timeout
 * ------------------------------------------------
 */

const timeoutRequest = createHardenedGitHubRequest({
  fetchImpl: (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => {
          reject(new Error("aborted"));
        },
        {
          once: true,
        },
      );
    }),
});

let timeoutRejected = false;

try {
  await timeoutRequest("https://api.github.com/repos/kivanta/kivanta-scout", {
    timeoutMs: 10,
  });
} catch (error) {
  timeoutRejected = error?.code === "github_request_timeout";
}

results.push(check("timed-out request rejected", timeoutRejected));

/*
 * ------------------------------------------------
 * Test 9
 * Empty token means unauthenticated API request
 * ------------------------------------------------
 */

let observedUnauthenticatedRequest = null;

const unauthenticatedRequest = createHardenedGitHubRequest({
  token: "   ",

  fetchImpl: async (url, options) => {
    observedUnauthenticatedRequest = {
      url,

      options,
    };

    return new Response("{}", {
      status: 200,
    });
  },
});

await unauthenticatedRequest(
  "https://api.github.com/repos/kivanta/kivanta-scout",
);

const unauthenticatedHeaders = new Headers(
  observedUnauthenticatedRequest?.options?.headers,
);

results.push(
  check(
    "empty token does not create Authorization header",
    unauthenticatedHeaders.get("Authorization") === null,
  ),
);

/*
 * ------------------------------------------------
 * Final
 * ------------------------------------------------
 */

const passed = results.filter(Boolean).length;

console.log("");
console.log(`Passed ${passed}/${results.length} checks.`);

if (passed !== results.length) {
  process.exitCode = 1;
}
