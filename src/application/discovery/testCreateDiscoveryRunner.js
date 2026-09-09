import { createDiscoveryRunner } from "./createDiscoveryRunner.js";

/*
 * Kivanta Scout
 * Discovery Composition Boundary Tests
 *
 * These tests prove that:
 *
 * - both request boundaries are required
 * - direct GitHub discovery uses githubRequest
 * - GitHub source assessment continues using githubRequest
 * - website discovery uses publicRequest
 * - Technocore public references use publicRequest
 * - the two outbound request boundaries stay separated
 */

let passed = 0;

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function test(name, callback) {
  try {
    await callback();

    passed += 1;

    console.log(`PASS — ${name}`);
  } catch (error) {
    failed += 1;

    console.error(
      `FAIL — ${name}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function expectFactoryError(callback, expectedMessage) {
  let receivedError = null;

  try {
    callback();
  } catch (error) {
    receivedError = error;
  }

  assert(
    receivedError,
    `Expected ${expectedMessage}, but no error was thrown.`,
  );

  assert(
    receivedError.message === expectedMessage,
    `Expected ${expectedMessage}, received ${receivedError.message}.`,
  );
}

/*
 * ------------------------------------------------
 * 1. GitHub boundary is required
 * ------------------------------------------------
 */

await test("GitHub request boundary is required", async () => {
  expectFactoryError(
    () =>
      createDiscoveryRunner({
        publicRequest: async () => new Response("ok"),
      }),
    "github_request_boundary_required",
  );
});

/*
 * ------------------------------------------------
 * 2. Public-reference boundary is required
 * ------------------------------------------------
 */

await test("public reference request boundary is required", async () => {
  expectFactoryError(
    () =>
      createDiscoveryRunner({
        githubRequest: async () => new Response("ok"),
      }),
    "public_reference_request_boundary_required",
  );
});

/*
 * ------------------------------------------------
 * 3. Website discovery uses publicRequest
 * ------------------------------------------------
 */

await test("website discovery uses public request boundary", async () => {
  let publicCalls = 0;

  let githubCalls = 0;

  const publicRequest = async () => {
    publicCalls += 1;

    return new Response(
      `
            <!doctype html>
            <html>
              <body>
                <p>No repository link here.</p>
              </body>
            </html>
          `,
      {
        status: 200,

        headers: {
          "content-type": "text/html",
        },
      },
    );
  };

  const githubRequest = async () => {
    githubCalls += 1;

    return new Response(
      JSON.stringify({
        message: "unexpected",
      }),
      {
        status: 500,

        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  const runner = createDiscoveryRunner({
    githubRequest,
    publicRequest,
  });

  const result = await runner("https://example.com/project");

  assert(result.status === "discovery_only", "Expected discovery-only result.");

  assert(
    publicCalls === 1,
    `Expected 1 public request, received ${publicCalls}.`,
  );

  assert(
    githubCalls === 0,
    `Expected 0 GitHub requests, received ${githubCalls}.`,
  );
});

/*
 * ------------------------------------------------
 * 4. Direct GitHub discovery uses githubRequest
 * ------------------------------------------------
 *
 * The first repository lookup succeeds.
 *
 * The supported-source assessment then performs
 * another repository lookup through the SAME
 * injected GitHub boundary.
 *
 * We deliberately fail the later immutable
 * commit lookup so the test does not need to
 * construct a complete supported repository.
 */

await test("direct GitHub discovery stays inside GitHub request boundary", async () => {
  const githubCalls = [];

  let publicCalls = 0;

  const githubRequest = async (value) => {
    const url = new URL(value);

    githubCalls.push(url.toString());

    /*
     * Both discoverInput() and
     * assessGitHubSource() request the
     * repository identity here.
     */
    if (url.pathname === "/repos/example/project") {
      return new Response(
        JSON.stringify({
          id: 123456,

          full_name: "example/project",

          default_branch: "main",

          archived: false,
        }),
        {
          status: 200,

          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    /*
     * The later commit lookup deliberately
     * fails.
     */
    return new Response(
      JSON.stringify({
        message: "Not Found",
      }),
      {
        status: 404,

        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  const publicRequest = async () => {
    publicCalls += 1;

    return new Response("unexpected", {
      status: 500,
    });
  };

  const runner = createDiscoveryRunner({
    githubRequest,
    publicRequest,
  });

  const result = await runner("https://github.com/example/project");

  assert(
    result.status === "discovery_only",
    "Expected discovery-only result after commit lookup failure.",
  );

  assert(
    githubCalls.length >= 3,
    `Expected at least 3 GitHub requests, received ${githubCalls.length}.`,
  );

  assert(
    publicCalls === 0,
    `Expected 0 public-reference requests, received ${publicCalls}.`,
  );

  const repositoryCalls = githubCalls.filter((value) => {
    const url = new URL(value);

    return url.pathname === "/repos/example/project";
  });

  assert(
    repositoryCalls.length >= 2,
    "Expected repository discovery and source assessment to both use githubRequest.",
  );
});

/*
 * ------------------------------------------------
 * 5. Technocore reference uses publicRequest
 * ------------------------------------------------
 */

await test("Technocore public reference uses public request boundary", async () => {
  let publicCalls = 0;

  let githubCalls = 0;

  const publicRequest = async () => {
    publicCalls += 1;

    return new Response(
      `
            <html>
              <body>
                No GitHub repository
                and no did:key reference.
              </body>
            </html>
          `,
      {
        status: 200,

        headers: {
          "content-type": "text/html",
        },
      },
    );
  };

  const githubRequest = async () => {
    githubCalls += 1;

    return new Response("unexpected", {
      status: 500,
    });
  };

  const runner = createDiscoveryRunner({
    githubRequest,
    publicRequest,
  });

  const result = await runner("https://technocore.chat/example");

  assert(result.status === "discovery_only", "Expected discovery-only result.");

  assert(
    publicCalls === 1,
    `Expected 1 public request, received ${publicCalls}.`,
  );

  assert(
    githubCalls === 0,
    `Expected 0 GitHub requests, received ${githubCalls}.`,
  );
});

/*
 * ------------------------------------------------
 * Result
 * ------------------------------------------------
 */

console.log("");

console.log(`${passed}/${passed + failed} PASS`);

if (failed > 0) {
  process.exitCode = 1;
}
