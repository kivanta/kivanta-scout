import { createHardenedPublicReferenceRequest } from "./createHardenedPublicReferenceRequest.js";

/*
 * Kivanta Scout
 * Hardened Public Reference Request Tests
 */

let passed = 0;

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectErrorCode(promise, expectedCode) {
  let receivedError = null;

  try {
    await promise;
  } catch (error) {
    receivedError = error;
  }

  assert(receivedError, `Expected ${expectedCode}, but no error was thrown.`);

  assert(
    receivedError.code === expectedCode,
    `Expected ${expectedCode}, received ${receivedError.code}.`,
  );
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

/*
 * ------------------------------------------------
 * 1. HTTPS succeeds and remains readable
 * ------------------------------------------------
 */

await test("HTTPS public response succeeds and remains readable", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () =>
      new Response("<html>Scout</html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      }),
  });

  const response = await request("https://example.com/project");

  assert(response.ok === true, "Expected successful response.");

  const text = await response.text();

  assert(
    text === "<html>Scout</html>",
    "Expected reconstructed response body.",
  );
});

/*
 * ------------------------------------------------
 * 2. Public HTTP is supported
 * ------------------------------------------------
 */

await test("HTTP public hostname is supported", async () => {
  let seenUrl = null;

  const request = createHardenedPublicReferenceRequest({
    fetcher: async (url) => {
      seenUrl = url;

      return new Response("ok");
    },
  });

  await request("http://example.com/project");

  assert(seenUrl === "http://example.com/project", "Expected HTTP public URL.");
});

/*
 * ------------------------------------------------
 * 3. Non-HTTP protocols are rejected
 * ------------------------------------------------
 */

await test("non-HTTP protocol is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () => new Response("unexpected"),
  });

  await expectErrorCode(
    request("file:///etc/passwd"),
    "public_reference_protocol_not_allowed",
  );
});

/*
 * ------------------------------------------------
 * 4. localhost is rejected
 * ------------------------------------------------
 */

await test("localhost is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () => new Response("unexpected"),
  });

  await expectErrorCode(
    request("http://localhost/test"),
    "public_reference_hostname_not_allowed",
  );
});

/*
 * ------------------------------------------------
 * 5. Single-label hosts are rejected
 * ------------------------------------------------
 */

await test("single-label hostname is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () => new Response("unexpected"),
  });

  await expectErrorCode(
    request("https://internalhost/test"),
    "public_reference_hostname_not_allowed",
  );
});

/*
 * ------------------------------------------------
 * 6. IPv4 literals are rejected
 * ------------------------------------------------
 */

await test("IPv4 literal is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () => new Response("unexpected"),
  });

  await expectErrorCode(
    request("http://127.0.0.1/test"),
    "public_reference_ip_literal_not_allowed",
  );
});

/*
 * ------------------------------------------------
 * 7. IPv6 literals are rejected
 * ------------------------------------------------
 */

await test("IPv6 literal is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () => new Response("unexpected"),
  });

  await expectErrorCode(
    request("http://[::1]/test"),
    "public_reference_ip_literal_not_allowed",
  );
});

/*
 * ------------------------------------------------
 * 8. URL credentials are rejected
 * ------------------------------------------------
 */

await test("URL credentials are rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () => new Response("unexpected"),
  });

  await expectErrorCode(
    request("https://user:pass@example.com/"),
    "public_reference_credentials_not_allowed",
  );
});

/*
 * ------------------------------------------------
 * 9. Sensitive headers are stripped
 * ------------------------------------------------
 */

await test("sensitive caller headers are stripped", async () => {
  let capturedHeaders = null;

  const request = createHardenedPublicReferenceRequest({
    fetcher: async (_url, init) => {
      capturedHeaders = init.headers;

      return new Response("ok");
    },
  });

  await request("https://example.com/", {
    headers: {
      Accept: "text/html",

      Authorization: "Bearer secret",

      Cookie: "session=secret",

      "X-Forwarded-For": "127.0.0.1",
    },
  });

  assert(
    capturedHeaders.get("accept") === "text/html",
    "Expected safe Accept header to remain.",
  );

  assert(
    !capturedHeaders.has("authorization"),
    "Authorization must be stripped.",
  );

  assert(!capturedHeaders.has("cookie"), "Cookie must be stripped.");

  assert(
    !capturedHeaders.has("x-forwarded-for"),
    "X-Forwarded-For must be stripped.",
  );
});

/*
 * ------------------------------------------------
 * 10. Safe redirects are followed
 * ------------------------------------------------
 */

await test("safe redirect is followed", async () => {
  const seen = [];

  const request = createHardenedPublicReferenceRequest({
    fetcher: async (url) => {
      seen.push(url);

      if (seen.length === 1) {
        return new Response(null, {
          status: 302,

          headers: {
            Location: "/final",
          },
        });
      }

      return new Response("finished");
    },
  });

  const response = await request("https://example.com/start");

  assert(seen.length === 2, "Expected two requests.");

  assert(
    seen[1] === "https://example.com/final",
    "Expected validated redirect destination.",
  );

  assert((await response.text()) === "finished", "Expected final response.");
});

/*
 * ------------------------------------------------
 * 11. Unsafe redirects are rejected
 * ------------------------------------------------
 */

await test("redirect to unsafe destination is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () =>
      new Response(null, {
        status: 302,

        headers: {
          Location: "http://127.0.0.1/private",
        },
      }),
  });

  await expectErrorCode(
    request("https://example.com/start"),
    "public_reference_ip_literal_not_allowed",
  );
});

/*
 * ------------------------------------------------
 * 12. Redirect count is bounded
 * ------------------------------------------------
 */

await test("redirect limit is enforced", async () => {
  const request = createHardenedPublicReferenceRequest({
    maxRedirects: 1,

    fetcher: async () =>
      new Response(null, {
        status: 302,

        headers: {
          Location: "/again",
        },
      }),
  });

  await expectErrorCode(
    request("https://example.com/start"),
    "public_reference_redirect_limit_exceeded",
  );
});

/*
 * ------------------------------------------------
 * 13. Declared oversized responses are rejected
 * ------------------------------------------------
 */

await test("declared oversized response is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    maxBodyBytes: 10,

    fetcher: async () =>
      new Response("01234567890123456789", {
        headers: {
          "content-length": "20",
        },
      }),
  });

  await expectErrorCode(
    request("https://example.com/"),
    "public_reference_response_too_large",
  );
});

/*
 * ------------------------------------------------
 * 14. Streamed oversized responses are rejected
 * ------------------------------------------------
 */

await test("streamed oversized response is rejected", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4, 5, 6]));

      controller.enqueue(new Uint8Array([7, 8, 9, 10, 11, 12]));

      controller.close();
    },
  });

  const request = createHardenedPublicReferenceRequest({
    maxBodyBytes: 10,

    fetcher: async () => new Response(stream),
  });

  await expectErrorCode(
    request("https://example.com/"),
    "public_reference_response_too_large",
  );
});

/*
 * ------------------------------------------------
 * 15. Timeout is enforced
 * ------------------------------------------------
 */

await test("request timeout is enforced", async () => {
  const request = createHardenedPublicReferenceRequest({
    timeoutMs: 20,

    fetcher: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted");

            error.name = "AbortError";

            reject(error);
          },
          {
            once: true,
          },
        );
      }),
  });

  await expectErrorCode(
    request("https://example.com/"),
    "public_reference_request_timeout",
  );
});

/*
 * ------------------------------------------------
 * 16. Write methods are rejected
 * ------------------------------------------------
 */

await test("write method is rejected", async () => {
  const request = createHardenedPublicReferenceRequest({
    fetcher: async () => new Response("unexpected"),
  });

  await expectErrorCode(
    request("https://example.com/", {
      method: "POST",
    }),
    "public_reference_method_not_allowed",
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
