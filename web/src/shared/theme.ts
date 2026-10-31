import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

export type Theme = "dark" | "light";

const THEME_KEY = "shadowscope_theme";
const listeners = new Set<() => void>();

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
  listeners.forEach((listener) => listener());
}

/** Switches theme, crossfading only for the length of the switch where the browser can. */
export function toggleTheme() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  if (!document.startViewTransition) {
    applyTheme(next);
    return;
  }
  document.startViewTransition(() => flushSync(() => applyTheme(next)));
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme);
}

const CANVAS_TOKENS = {
  bg: "--bg",
  surface: "--surface",
  text: "--text",
  muted: "--muted",
  primary: "--primary",
  critical: "--critical",
  high: "--high",
  medium: "--medium",
} as const;

export type ThemeColors = Record<keyof typeof CANVAS_TOKENS, string>;

const colorCache = new Map<Theme, ThemeColors>();

function readColors(theme: Theme): ThemeColors {
  const cached = colorCache.get(theme);
  if (cached) return cached;
  const styles = getComputedStyle(document.documentElement);
  const entries = Object.entries(CANVAS_TOKENS).map(([name, token]) => [name, styles.getPropertyValue(token).trim()]);
  const colors = Object.fromEntries(entries) as ThemeColors;
  colorCache.set(theme, colors);
  return colors;
}

/** Resolved token values, for canvas and WebGL code that cannot read CSS variables. */
export function useThemeColors(): ThemeColors {
  return readColors(useTheme());
}
