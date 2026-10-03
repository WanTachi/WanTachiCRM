"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "wantachi-theme";
const THEME_EVENT = "wantachi-theme-change";

const labels: Record<Theme, string> = {
  dark: "Темная",
  light: "Светлая",
  system: "Системная",
};

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "dark" || saved === "light" || saved === "system" ? saved : "dark";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>;
  }
  if (theme === "system") {
    return <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>;
  }
  return <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" /></svg>;
}

export function ThemeSwitcher() {
  const theme = useSyncExternalStore<Theme>(subscribeToTheme, getStoredTheme, () => "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function selectTheme(nextTheme: Theme) {
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <details className="theme-switcher">
      <summary className="theme-switcher-trigger" aria-label={`Тема: ${labels[theme]}`}>
        <ThemeIcon theme={theme} />
        <span className="theme-switcher-label">{labels[theme]}</span>
      </summary>
      <div className="theme-switcher-popover" role="menu" aria-label="Выбор темы">
        {(["dark", "light", "system"] as Theme[]).map((option) => (
          <button className={`theme-option${theme === option ? " theme-option--active" : ""}`} key={option} type="button" role="menuitemradio" aria-checked={theme === option} onClick={() => selectTheme(option)}>
            <ThemeIcon theme={option} />
            <span>{labels[option]}</span>
            {theme === option ? <span className="theme-option-check" aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </details>
  );
}
