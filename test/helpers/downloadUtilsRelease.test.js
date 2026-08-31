const test = require("node:test");
const assert = require("node:assert");
const https = require("node:https");
const { EventEmitter } = require("node:events");

const { fetchLatestRelease } = require("../../scripts/lib/download-utils");

// Minimal stand-in for the https.get response stream fetchJson consumes.
function respondWith(body) {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  process.nextTick(() => {
    res.emit("data", JSON.stringify(body));
    res.emit("end");
  });
  return res;
}

// Stub https.get, routing each requested URL through `routes`, and record the
// URLs that were asked for so pagination itself can be asserted.
function stubHttps(routes) {
  const requested = [];
  const original = https.get;
  https.get = (url, _options, callback) => {
    requested.push(url);
    const body = routes(url);
    const req = new EventEmitter();
    req.on = req.on.bind(req);
    process.nextTick(() => callback(respondWith(body)));
    return req;
  };
  return {
    requested,
    restore: () => {
      https.get = original;
    },
  };
}

function release(tag, extra = {}) {
  return {
    tag_name: tag,
    html_url: `https://github.com/o/r/releases/tag/${tag}`,
    assets: [],
    draft: false,
    prerelease: false,
    ...extra,
  };
}

// A full first page of app releases, none matching the helper-binary prefix —
// mirrors the real repo, where helper releases age off page 1.
const PAGE_ONE = Array.from({ length: 100 }, (_, i) => release(`v1.9.${i}`));

test("fetchLatestRelease finds a prefixed release beyond the first page", async () => {
  const target = release("windows-key-listener-v1.0.0", {
    assets: [
      {
        name: "windows-key-listener-win32-x64.zip",
        browser_download_url: "https://example.test/wkl.zip",
      },
    ],
  });

  const stub = stubHttps((url) => {
    if (url.includes("page=2")) return [target];
    if (url.includes("page=3")) return [];
    return PAGE_ONE;
  });

  try {
    const found = await fetchLatestRelease("OpenWhispr/openwhispr", {
      tagPrefix: "windows-key-listener-v",
    });

    assert.ok(found, "expected the release to be found on a later page");
    assert.strictEqual(found.tag, "windows-key-listener-v1.0.0");
    assert.deepStrictEqual(found.assets, [
      { name: "windows-key-listener-win32-x64.zip", url: "https://example.test/wkl.zip" },
    ]);
  } finally {
    stub.restore();
  }
});

test("fetchLatestRelease stops paginating once a short page is returned", async () => {
  const stub = stubHttps((url) => (url.includes("page=2") ? [release("v1.0.0")] : PAGE_ONE));

  try {
    const found = await fetchLatestRelease("OpenWhispr/openwhispr", {
      tagPrefix: "no-such-thing-",
    });

    assert.strictEqual(found, null);
    // Page 2 came back short (1 < 100), so there is no page 3 to ask for.
    assert.ok(
      !stub.requested.some((url) => url.includes("page=3")),
      `should not request page 3, requested: ${stub.requested.join(", ")}`
    );
  } finally {
    stub.restore();
  }
});

test("fetchLatestRelease still returns the newest match on the first page", async () => {
  const stub = stubHttps(() => [
    release("windows-key-listener-v2.0.0"),
    release("windows-key-listener-v1.0.0"),
  ]);

  try {
    const found = await fetchLatestRelease("OpenWhispr/openwhispr", {
      tagPrefix: "windows-key-listener-v",
    });

    assert.strictEqual(found.tag, "windows-key-listener-v2.0.0");
  } finally {
    stub.restore();
  }
});

test("fetchLatestRelease skips drafts and prereleases while paginating", async () => {
  const stub = stubHttps((url) => {
    if (url.includes("page=2")) {
      return [
        release("windows-key-listener-v3.0.0", { draft: true }),
        release("windows-key-listener-v2.0.0", { prerelease: true }),
        release("windows-key-listener-v1.0.0"),
      ];
    }
    return PAGE_ONE;
  });

  try {
    const found = await fetchLatestRelease("OpenWhispr/openwhispr", {
      tagPrefix: "windows-key-listener-v",
    });

    assert.strictEqual(found.tag, "windows-key-listener-v1.0.0");
  } finally {
    stub.restore();
  }
});
