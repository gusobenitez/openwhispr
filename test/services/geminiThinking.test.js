const test = require("node:test");
const assert = require("node:assert/strict");

const HELPER = "../../src/services/ai/geminiThinking.ts";

// Gemma 4 declares an explicit two-way mapping: the "Disable thinking" toggle
// chooses between "minimal" (off) and "high" (on).
const GEMMA_4 = {
  supportsThinking: true,
  thinkingLevels: { disabled: "minimal", enabled: "high" },
};
// Gemini 3.5 Flash only declares supportsThinking (no levels) — it can only be
// pushed down to "minimal" when thinking is disabled, otherwise left at default.
const GEMINI_3_5 = { supportsThinking: true };
// Gemini 2.5 Flash Lite has no thinking support at all.
const NON_THINKING = {};
// Gemini 3.5 Flash Lite exposes all four levels. `enabled` is the level the
// legacy "thinking on" boolean migrates to; `disabled` is the "off" level.
const FLASH_LITE = {
  supportsThinking: true,
  thinkingLevels: {
    options: ["minimal", "low", "medium", "high"],
    disabled: "minimal",
    enabled: "medium",
  },
};

test("Gemma 4 maps disabled -> minimal", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.deepEqual(resolveGeminiThinkingConfig(GEMMA_4, true), {
    thinkingLevel: "minimal",
    includeThoughts: false,
  });
});

test("Gemma 4 maps enabled -> high", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.deepEqual(resolveGeminiThinkingConfig(GEMMA_4, false), {
    thinkingLevel: "high",
    includeThoughts: false,
  });
});

test("Gemma 4 defaults to enabled (high) when disableThinking is undefined", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.deepEqual(resolveGeminiThinkingConfig(GEMMA_4, undefined), {
    thinkingLevel: "high",
    includeThoughts: false,
  });
});

test("supportsThinking-only model maps disabled -> minimal", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.deepEqual(resolveGeminiThinkingConfig(GEMINI_3_5, true), {
    thinkingLevel: "minimal",
    includeThoughts: false,
  });
});

test("supportsThinking-only model leaves thinking untouched when enabled", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.equal(resolveGeminiThinkingConfig(GEMINI_3_5, false), undefined);
  assert.equal(resolveGeminiThinkingConfig(GEMINI_3_5, undefined), undefined);
});

test("non-thinking model is never given a thinkingConfig", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.equal(resolveGeminiThinkingConfig(NON_THINKING, true), undefined);
  assert.equal(resolveGeminiThinkingConfig(NON_THINKING, false), undefined);
});

test("unknown model (undefined def) is never given a thinkingConfig", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.equal(resolveGeminiThinkingConfig(undefined, true), undefined);
});

// --- getThinkingLevelOptions: which models get a level selector at all ---

test("getThinkingLevelOptions returns the ordered options for a four-level model", async () => {
  const { getThinkingLevelOptions } = await import(HELPER);
  assert.deepEqual(getThinkingLevelOptions(FLASH_LITE), ["minimal", "low", "medium", "high"]);
});

test("getThinkingLevelOptions derives [disabled, enabled] when a model omits options", async () => {
  const { getThinkingLevelOptions } = await import(HELPER);
  assert.deepEqual(getThinkingLevelOptions(GEMMA_4), ["minimal", "high"]);
});

test("getThinkingLevelOptions returns undefined for models without declared levels", async () => {
  const { getThinkingLevelOptions } = await import(HELPER);
  assert.equal(getThinkingLevelOptions(GEMINI_3_5), undefined);
  assert.equal(getThinkingLevelOptions(NON_THINKING), undefined);
  assert.equal(getThinkingLevelOptions(undefined), undefined);
});

// --- resolveThinkingLevel: migration from the legacy boolean, plus clamping ---

test("resolveThinkingLevel honors a stored level that the model supports", async () => {
  const { resolveThinkingLevel } = await import(HELPER);
  assert.equal(resolveThinkingLevel("low", true, FLASH_LITE), "low");
  assert.equal(resolveThinkingLevel("high", false, FLASH_LITE), "high");
});

test("resolveThinkingLevel migrates from the legacy boolean when no level is stored", async () => {
  const { resolveThinkingLevel } = await import(HELPER);
  assert.equal(resolveThinkingLevel(undefined, true, FLASH_LITE), "minimal");
  assert.equal(resolveThinkingLevel(undefined, false, FLASH_LITE), "medium");
});

test("resolveThinkingLevel clamps a stored level the model does not support", async () => {
  const { resolveThinkingLevel } = await import(HELPER);
  // "medium" is valid for Flash Lite but not for Gemma 4 — switching models must
  // not leave the selector on an unsupported value.
  assert.equal(resolveThinkingLevel("medium", false, GEMMA_4), "high");
  assert.equal(resolveThinkingLevel("medium", true, GEMMA_4), "minimal");
  assert.equal(resolveThinkingLevel("nonsense", true, FLASH_LITE), "minimal");
});

test("resolveThinkingLevel returns undefined for models without declared levels", async () => {
  const { resolveThinkingLevel } = await import(HELPER);
  assert.equal(resolveThinkingLevel("high", false, GEMINI_3_5), undefined);
  assert.equal(resolveThinkingLevel("high", false, NON_THINKING), undefined);
  assert.equal(resolveThinkingLevel("high", false, undefined), undefined);
});

// --- resolveGeminiThinkingConfig: the stored level drives the request ---

test("a stored level is sent verbatim for a four-level model", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.deepEqual(resolveGeminiThinkingConfig(FLASH_LITE, false, "low"), {
    thinkingLevel: "low",
    includeThoughts: false,
  });
});

test("an explicit level wins over the legacy disableThinking boolean", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  // Once a model exposes a selector the boolean toggle is not rendered for it,
  // so a stored selection must not be overridden by a stale boolean.
  assert.deepEqual(resolveGeminiThinkingConfig(FLASH_LITE, true, "high"), {
    thinkingLevel: "high",
    includeThoughts: false,
  });
});

test("an unsupported stored level falls back to the boolean mapping", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  assert.deepEqual(resolveGeminiThinkingConfig(GEMMA_4, false, "medium"), {
    thinkingLevel: "high",
    includeThoughts: false,
  });
});

test("a stored level never leaks onto a model without declared levels", async () => {
  const { resolveGeminiThinkingConfig } = await import(HELPER);
  // Guards the self-hosted/unknown-model case: we must not start sending a new
  // wire field to endpoints that never received one.
  assert.equal(resolveGeminiThinkingConfig(GEMINI_3_5, false, "high"), undefined);
  assert.equal(resolveGeminiThinkingConfig(NON_THINKING, false, "high"), undefined);
  assert.equal(resolveGeminiThinkingConfig(undefined, false, "high"), undefined);
});

// --- output budget -------------------------------------------------------
// Reasoning tokens are charged against the same `maxOutputTokens` ceiling as the
// answer, so an answer-sized budget gets eaten by thinking and the answer is
// returned truncated (finishReason: MAX_TOKENS).

test("minimal thinking needs no headroom", async () => {
  const { resolveGeminiMaxOutputTokens } = await import(HELPER);
  assert.equal(
    resolveGeminiMaxOutputTokens(2000, { thinkingLevel: "minimal", includeThoughts: false }),
    2000
  );
});

test("headroom grows with the thinking level", async () => {
  const { resolveGeminiMaxOutputTokens } = await import(HELPER);
  const budgets = ["minimal", "low", "medium", "high"].map((thinkingLevel) =>
    resolveGeminiMaxOutputTokens(2000, { thinkingLevel, includeThoughts: false })
  );
  assert.deepEqual(budgets, [2000, 4048, 6096, 10192]);
});

test("headroom clears the observed truncation by a wide margin", async () => {
  const { resolveGeminiMaxOutputTokens } = await import(HELPER);
  // The reported failure: a ~490-char cleanup at 2000 total tokens came back cut
  // off mid-sentence, having spent ~1.9k of them reasoning. The same request must
  // now have room for that reasoning *and* the whole answer, with slack to spare.
  const OBSERVED_THINKING_TOKENS = 1900;
  const WHOLE_ANSWER_TOKENS = 150;
  const budget = resolveGeminiMaxOutputTokens(2000, {
    thinkingLevel: "medium",
    includeThoughts: false,
  });
  assert.ok(budget > (OBSERVED_THINKING_TOKENS + WHOLE_ANSWER_TOKENS) * 2, `budget was ${budget}`);
});

test("a missing thinkingConfig is budgeted as the API default, not as off", async () => {
  const { resolveGeminiMaxOutputTokens } = await import(HELPER);
  // Gemini 3.1 Pro / 3 Flash declare no thinking metadata, so no thinkingConfig
  // is sent — but they still think, and a zero-headroom budget truncates them.
  assert.equal(resolveGeminiMaxOutputTokens(2000, undefined), 6096);
});

test("headroom is additive on top of the answer budget", async () => {
  const { resolveGeminiMaxOutputTokens } = await import(HELPER);
  // The answer budget is already clamped by the caller; headroom must not eat
  // into it, or a long transcript gains reasoning room by losing answer room.
  const high = { thinkingLevel: "high", includeThoughts: false };
  assert.equal(resolveGeminiMaxOutputTokens(8192, high), 8192 + 8192);
});
