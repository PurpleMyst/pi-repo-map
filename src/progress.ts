// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

/**
 * Progress reporting for repo map generation.
 * Uses pi's setWidget API to show real-time progress below the editor.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";

export type ProgressPhase =
  | "collecting"
  | "init"
  | "parsing"
  | "graphing"
  | "rendering"
  | "done";

export interface ProgressState {
  phase: ProgressPhase;
  current: number;
  total: number;
  message: string;
}

export type ProgressCallback = (state: ProgressState) => void;

const PHASE_LABELS: Record<ProgressPhase, string> = {
  collecting: "Discovering files",
  init: "Loading parsers",
  parsing: "Parsing files",
  graphing: "Analyzing dependencies",
  rendering: "Generating repo map",
  done: "Complete",
};

const PHASE_ICONS: Record<ProgressPhase, string> = {
  collecting: "🔍",
  init: "⚙️",
  parsing: "📝",
  graphing: "🔗",
  rendering: "📊",
  done: "✅",
};

/**
 * Render progress state as a single-line text widget.
 */
export function renderProgressLine(state: ProgressState, theme: Theme): string[] {
  const icon = PHASE_ICONS[state.phase];
  const label = PHASE_LABELS[state.phase];

  let detail = "";
  if (state.phase === "done") {
    detail = state.message;
  } else if (state.total > 0) {
    const percent = Math.round((state.current / state.total) * 100);
    detail = `${state.current}/${state.total} (${percent}%)`;
  } else if (state.message) {
    detail = state.message;
  }

  const line = detail
    ? `${icon} Repo Map: ${label} — ${detail}`
    : `${icon} Repo Map: ${label}`;

  return [theme.fg("accent", line)];
}

/**
 * Create a progress callback that updates a widget via setWidget.
 */
export function createWidgetProgressCallback(
  setWidget: (
    id: string,
    content: ((tui: unknown, theme: Theme) => { render: () => string[]; invalidate: () => void }) | undefined
  ) => void,
  widgetId: string = "repo-map-progress"
): ProgressCallback {
  let state: ProgressState = {
    phase: "collecting",
    current: 0,
    total: 0,
    message: "",
  };

  return (update: Partial<ProgressState>) => {
    state = { ...state, ...update };
    setWidget(widgetId, (_tui, theme) => ({
      render: () => renderProgressLine(state, theme),
      invalidate: () => {},
    }));
  };
}

/**
 * Clear the progress widget.
 */
export function clearProgressWidget(
  setWidget: (
    id: string,
    content: ((tui: unknown, theme: Theme) => { render: () => string[]; invalidate: () => void }) | undefined
  ) => void,
  widgetId: string = "repo-map-progress"
): void {
  setWidget(widgetId, undefined);
}
