import type { SettingsState } from "../stores/settingsStore";

export interface InferenceScopeStoreKeys {
  mode: keyof SettingsState;
  provider: keyof SettingsState;
  model: keyof SettingsState;
  cloudMode?: keyof SettingsState;
  cloudBaseUrl?: keyof SettingsState;
  remoteUrl?: keyof SettingsState;
  customApiKey?: keyof SettingsState;
  disableThinking?: keyof SettingsState;
  // Gemini/Gemma models that accept a thinkingConfig.thinkingLevel store the
  // chosen level here; every other model keeps using the disableThinking boolean.
  thinkingLevel?: keyof SettingsState;
}

export interface InferenceScopeDefinition {
  storeKeys: InferenceScopeStoreKeys;
  fallbackScope?: string;
}

export const INFERENCE_SCOPES = {
  dictationCleanup: {
    storeKeys: {
      mode: "cleanupMode",
      provider: "cleanupProvider",
      model: "cleanupModel",
      cloudMode: "cleanupCloudMode",
      cloudBaseUrl: "cleanupCloudBaseUrl",
      remoteUrl: "cleanupRemoteUrl",
      customApiKey: "cleanupCustomApiKey",
      disableThinking: "cleanupDisableThinking",
      thinkingLevel: "cleanupThinkingLevel",
    },
  },
  dictationAgent: {
    storeKeys: {
      mode: "dictationAgentMode",
      provider: "dictationAgentProvider",
      model: "dictationAgentModel",
      cloudMode: "dictationAgentCloudMode",
      cloudBaseUrl: "dictationAgentCloudBaseUrl",
      remoteUrl: "dictationAgentRemoteUrl",
      customApiKey: "dictationAgentCustomApiKey",
      disableThinking: "dictationAgentDisableThinking",
      thinkingLevel: "dictationAgentThinkingLevel",
    },
  },
  noteFormatting: {
    storeKeys: {
      mode: "noteFormattingMode",
      provider: "noteFormattingProvider",
      model: "noteFormattingModel",
      cloudMode: "noteFormattingCloudMode",
      cloudBaseUrl: "noteFormattingCloudBaseUrl",
      remoteUrl: "noteFormattingRemoteUrl",
      customApiKey: "noteFormattingCustomApiKey",
      disableThinking: "noteFormattingDisableThinking",
      thinkingLevel: "noteFormattingThinkingLevel",
    },
    fallbackScope: "dictationCleanup",
  },
  chatIntelligence: {
    storeKeys: {
      mode: "chatAgentMode",
      provider: "chatAgentProvider",
      model: "chatAgentModel",
      cloudMode: "chatAgentCloudMode",
      cloudBaseUrl: "chatAgentCloudBaseUrl",
      remoteUrl: "chatAgentRemoteUrl",
      customApiKey: "chatAgentCustomApiKey",
      disableThinking: "chatAgentDisableThinking",
      thinkingLevel: "chatAgentThinkingLevel",
    },
  },
  dictationTranslation: {
    storeKeys: {
      mode: "translationMode",
      provider: "translationProvider",
      model: "translationModel",
      cloudMode: "translationCloudMode",
      cloudBaseUrl: "translationCloudBaseUrl",
      remoteUrl: "translationRemoteUrl",
      customApiKey: "translationCustomApiKey",
      disableThinking: "translationDisableThinking",
      thinkingLevel: "translationThinkingLevel",
    },
  },
} as const satisfies Record<string, InferenceScopeDefinition>;

export type InferenceScope = keyof typeof INFERENCE_SCOPES;
