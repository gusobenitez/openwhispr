const test = require("node:test");
const assert = require("node:assert/strict");

const registry = require("../../src/models/modelRegistryData.json");

function geminiModels() {
  const provider = registry.cloudProviders.find((p) => p.id === "gemini");
  assert.ok(provider, "gemini provider missing from the registry");
  return provider.models;
}

function geminiModel(id) {
  return geminiModels().find((m) => m.id === id);
}

test("gemini-3.5-flash-lite is registered under the Google Gemini provider", () => {
  const model = geminiModel("gemini-3.5-flash-lite");
  assert.ok(model, "gemini-3.5-flash-lite missing from the gemini provider");
  assert.equal(model.name, "Gemini 3.5 Flash Lite");
  assert.ok(model.descriptionKey, "model needs a descriptionKey for i18n");
});

test("gemini-3.5-flash-lite exposes all four thinking levels in order", () => {
  const { thinkingLevels, supportsThinking } = geminiModel("gemini-3.5-flash-lite");
  assert.equal(supportsThinking, true);
  assert.deepEqual(thinkingLevels.options, ["minimal", "low", "medium", "high"]);
  // The API default for Flash Lite is "minimal"; "off" must map to it.
  assert.equal(thinkingLevels.disabled, "minimal");
  assert.ok(thinkingLevels.options.includes(thinkingLevels.enabled));
});

test("every declared thinking level is one the Gemini API accepts", () => {
  const VALID = new Set(["minimal", "low", "medium", "high"]);
  for (const model of geminiModels()) {
    const levels = model.thinkingLevels;
    if (!levels) continue;
    for (const level of levels.options ?? []) {
      assert.ok(VALID.has(level), `${model.id} declares unsupported level "${level}"`);
    }
    assert.ok(VALID.has(levels.disabled), `${model.id} disabled level invalid`);
    assert.ok(VALID.has(levels.enabled), `${model.id} enabled level invalid`);
  }
});

test("a model declaring thinkingLevels also declares supportsThinking", () => {
  for (const model of geminiModels()) {
    if (!model.thinkingLevels) continue;
    assert.equal(model.supportsThinking, true, `${model.id} has levels but not supportsThinking`);
  }
});

// Google's Gemini 3 migration guidance is explicit: temperature/top_p/top_k must
// be removed from requests to 3.x models, whose reasoning is tuned for defaults.
test("Gemini 3.x models opt out of temperature", () => {
  for (const id of [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
  ]) {
    const model = geminiModel(id);
    assert.ok(model, `${id} missing from the registry`);
    assert.equal(model.supportsTemperature, false, `${id} should opt out of temperature`);
  }
});

test("non-Gemini-3 models on the Gemini provider keep temperature", () => {
  for (const id of ["gemini-2.5-flash-lite", "gemma-4-31b-it", "gemma-4-26b-a4b-it"]) {
    const model = geminiModel(id);
    assert.ok(model, `${id} missing from the registry`);
    assert.notEqual(model.supportsTemperature, false, `${id} should still send temperature`);
  }
});
