// Shared mapping from a model's registry thinking metadata + the user's stored
// thinking level (falling back to the legacy "Disable thinking" toggle) to a
// Gemini `thinkingConfig`. Used by both the native REST cleanup path
// (`inferenceProviders/gemini.ts`) and the AI-SDK agent stream path
// (`ReasoningService.ts`) so the behavior stays identical.
//
// @sync(gemini-thinking-config) callers: gemini.ts, ReasoningService.ts

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

// A `type` (not `interface`) so it stays assignable to the AI SDK's
// `providerOptions.google` value, which requires an index-signature/JSON-object
// shape — named interfaces are rejected there.
export type GeminiThinkingConfig = {
  thinkingLevel: GeminiThinkingLevel;
  includeThoughts: boolean;
};

// The subset of a CloudModelDefinition this mapping depends on. Kept structural
// (rather than importing CloudModelDefinition) so the functions are pure and
// unit testable without the model registry.
interface GeminiThinkingModelInfo {
  supportsThinking?: boolean;
  thinkingLevels?: { options?: string[]; disabled: string; enabled: string };
}

/**
 * The ordered thinking levels a model lets the user choose between, or
 * `undefined` when the model has no level selector.
 *
 * Models predating the four-level API (Gemma 4) declare only `disabled`/
 * `enabled`, which is treated as a two-option list so one code path drives both.
 */
export function getThinkingLevelOptions(
  modelDef: GeminiThinkingModelInfo | undefined
): GeminiThinkingLevel[] | undefined {
  const levels = modelDef?.thinkingLevels;
  if (!levels) return undefined;

  const options = levels.options?.length ? levels.options : [levels.disabled, levels.enabled];
  return options as GeminiThinkingLevel[];
}

/**
 * Resolve which level should be considered selected, or `undefined` for models
 * without a level selector.
 *
 * `stored` wins whenever the model actually supports it. Otherwise we fall back
 * to the legacy `disableThinking` boolean, which covers two cases at once:
 * users upgrading from before the selector existed (nothing stored yet), and
 * users switching to a model that does not accept their previous level — so the
 * selector can never render on an unsupported value.
 */
export function resolveThinkingLevel(
  stored: string | undefined,
  disableThinking: boolean | undefined,
  modelDef: GeminiThinkingModelInfo | undefined
): GeminiThinkingLevel | undefined {
  const levels = modelDef?.thinkingLevels;
  const options = getThinkingLevelOptions(modelDef);
  if (!levels || !options) return undefined;

  if (stored && options.includes(stored as GeminiThinkingLevel)) {
    return stored as GeminiThinkingLevel;
  }

  return (disableThinking ? levels.disabled : levels.enabled) as GeminiThinkingLevel;
}

/**
 * Resolve the Gemini `thinkingConfig`, or `undefined` to leave thinking at the
 * API default.
 *
 * - Models that declare `thinkingLevels` (Gemini 3.5 Flash Lite's four levels,
 *   Gemma 4's two) are sent the resolved level explicitly.
 * - Models that only declare `supportsThinking` are pushed down to "minimal"
 *   when the user disables thinking; otherwise they keep the API default (no
 *   thinkingConfig sent).
 * - Models with neither flag are never sent a thinkingConfig. This matters
 *   beyond Gemini: it is what keeps custom and self-hosted endpoints receiving
 *   exactly the request shape they receive today.
 *
 * `includeThoughts: false` is always set so Gemini never echoes thought-summary
 * parts back to us — the dictation/agent output should only contain the answer.
 */
export function resolveGeminiThinkingConfig(
  modelDef: GeminiThinkingModelInfo | undefined,
  disableThinking: boolean | undefined,
  thinkingLevel?: string
): GeminiThinkingConfig | undefined {
  const level = resolveThinkingLevel(thinkingLevel, disableThinking, modelDef);
  if (level) {
    return { thinkingLevel: level, includeThoughts: false };
  }

  if (disableThinking === true && modelDef?.supportsThinking) {
    return { thinkingLevel: "minimal", includeThoughts: false };
  }

  return undefined;
}
