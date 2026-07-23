import { Zap, Gauge, Brain, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GeminiThinkingLevel } from "../../services/ai/geminiThinking";

const LEVEL_ICONS: Record<GeminiThinkingLevel, typeof Zap> = {
  minimal: Zap,
  low: Gauge,
  medium: Brain,
  high: Sparkles,
};

interface ThinkingLevelSelectorProps {
  /** Ordered levels this model accepts, cheapest first. */
  options: GeminiThinkingLevel[];
  /** Currently selected level. Always one of `options`. */
  value: GeminiThinkingLevel;
  onChange: (level: GeminiThinkingLevel) => void;
}

/**
 * Segmented control over the thinking levels a model accepts. Gemini 3.5 models
 * take all four (minimal/low/medium/high); Gemma 4 only has two, so it renders
 * as a Minimal/High pair. Models whose thinking can merely be switched off use
 * the plain `Toggle` instead.
 */
export function ThinkingLevelSelector({ options, value, onChange }: ThinkingLevelSelectorProps) {
  const { t } = useTranslation();

  const buttonClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
      active ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="inline-flex shrink-0 gap-0.5 rounded-md border border-border-subtle bg-surface-1 p-0.5">
      {options.map((level) => {
        const Icon = LEVEL_ICONS[level];
        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={buttonClass(level === value)}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`reasoning.thinkingLevel.${level}`)}
          </button>
        );
      })}
    </div>
  );
}
