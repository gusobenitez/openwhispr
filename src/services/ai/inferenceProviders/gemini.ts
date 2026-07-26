import type { InferenceProvider } from "./types";
import { getCloudModel } from "../../../models/ModelRegistry";
import { withRetry, createApiRetryStrategy, httpError } from "../../../utils/retry";
import { API_ENDPOINTS, TOKEN_LIMITS } from "../../../config/constants";
import {
  resolveGeminiThinkingConfig,
  resolveGeminiMaxOutputTokens,
  type GeminiThinkingConfig,
} from "../geminiThinking";
import { wrapCleanupTranscript } from "../../../config/prompts";
import { extractApiErrorMessage } from "../apiErrorMessage";
import logger from "../../../utils/logger";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  usageMetadata?: { totalTokenCount?: number };
}

interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens: number;
  thinkingConfig?: GeminiThinkingConfig;
}

export const geminiProvider: InferenceProvider = {
  id: "gemini",
  async call({ text, model, agentName, config, ctx }) {
    logger.logReasoning("GEMINI_START", { model, agentName, hasApiKey: false });
    const apiKey = await ctx.getApiKey("gemini");
    logger.logReasoning("GEMINI_API_KEY", { hasApiKey: !!apiKey, keyLength: apiKey?.length || 0 });

    const systemPrompt = config.systemPrompt || ctx.getSystemPrompt(agentName);
    const userContent = config.systemPrompt ? text : wrapCleanupTranscript(text);

    const modelDef = getCloudModel(model);

    // Map the model's thinking metadata + the user's stored level (falling back
    // to the "Disable thinking" toggle) to a thinkingConfig (see
    // geminiThinking.ts). Non-thinking models are left untouched.
    const thinkingConfig = resolveGeminiThinkingConfig(
      modelDef,
      config.disableThinking,
      config.thinkingLevel
    );

    // Budget for the answer first, then grow it to cover the reasoning that
    // shares the same `maxOutputTokens` ceiling — otherwise thinking eats the
    // budget and the answer comes back cut off mid-sentence.
    const answerTokens =
      config.maxTokens ||
      Math.max(
        2000,
        ctx.calculateMaxTokens(
          text.length,
          TOKEN_LIMITS.MIN_TOKENS_GEMINI,
          TOKEN_LIMITS.MAX_TOKENS_GEMINI,
          TOKEN_LIMITS.TOKEN_MULTIPLIER
        )
      );

    const generationConfig: GeminiGenerationConfig = {
      maxOutputTokens: resolveGeminiMaxOutputTokens(answerTokens, thinkingConfig),
    };

    // Gemini 3.x rejects temperature/top_p/top_k — its reasoning is tuned for the
    // API defaults — so models that opt out in the registry are sent no
    // temperature at all, not merely a default one.
    if (modelDef?.supportsTemperature !== false) {
      generationConfig.temperature = config.temperature ?? (config.systemPrompt ? 0.3 : 0);
    }

    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const requestBody = {
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
      generationConfig,
    };

    const response = await withRetry(async () => {
      logger.logReasoning("GEMINI_REQUEST", {
        endpoint: `${API_ENDPOINTS.GEMINI}/models/${model}:generateContent`,
        model,
        hasApiKey: !!apiKey,
        requestBody: JSON.stringify(requestBody).substring(0, 200),
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(`${API_ENDPOINTS.GEMINI}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorText = await res.text();
          let errorData: { error?: { message?: string } | string; message?: string } = {
            error: res.statusText,
          };
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText || res.statusText };
          }

          logger.logReasoning("GEMINI_API_ERROR_DETAIL", {
            status: res.status,
            statusText: res.statusText,
            error: errorData,
            fullResponse: errorText.substring(0, 500),
          });

          const errMsg = extractApiErrorMessage(errorData, `Gemini API error: ${res.status}`);
          throw httpError(errMsg, res.status);
        }

        const jsonResponse = (await res.json()) as GeminiResponse;
        logger.logReasoning("GEMINI_RAW_RESPONSE", {
          hasResponse: !!jsonResponse,
          hasCandidates: !!jsonResponse?.candidates,
          candidatesLength: jsonResponse?.candidates?.length || 0,
        });
        return jsonResponse;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error("Request timed out after 30s");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, createApiRetryStrategy());

    const candidate = response.candidates?.[0];
    // Gemma 4 (and other thinking-capable Gemini models) split their output into a
    // reasoning part flagged `thought: true` plus a separate answer part. Skip the
    // thought parts and return only the answer; for single-part responses (e.g.
    // gemini-2.5-flash-lite) this is a no-op.
    const responseText = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text || "")
      .join("")
      .trim();

    // A MAX_TOKENS finish means the answer stops wherever the budget ran out —
    // usually mid-sentence. That is checked before the empty-response guard
    // because partial text is the common case once reasoning shares the budget,
    // and silently returning it would paste a half-finished dictation. Throwing
    // hands the caller back to the raw transcript (see the reasoning fallback in
    // audioManager.processTranscription), which is at least complete.
    if (candidate?.finishReason === "MAX_TOKENS") {
      logger.logReasoning("GEMINI_TRUNCATED", {
        model,
        responseLength: responseText.length,
        maxOutputTokens: generationConfig.maxOutputTokens,
        thinkingLevel: thinkingConfig?.thinkingLevel,
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
      });
      throw new Error(
        "Gemini reached token limit before finishing its response. Try a shorter input, a lower thinking level, or increase max tokens."
      );
    }

    if (!responseText) {
      logger.logReasoning("GEMINI_EMPTY_RESPONSE", {
        model,
        finishReason: candidate?.finishReason,
      });
      throw new Error("Gemini returned empty response");
    }

    logger.logReasoning("GEMINI_RESPONSE", {
      model,
      responseLength: responseText.length,
      finishReason: candidate?.finishReason,
      tokensUsed: response.usageMetadata?.totalTokenCount || 0,
      success: true,
    });
    return responseText;
  },
};
