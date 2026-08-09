/**
 * @feature shell
 * @layer ui
 *
 * Shared dark-mode toggle — persists to localStorage and syncs via a window event
 * so sidebar footer and top-bar profile menus stay in lockstep.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "clarity-theme";
const CHANGE_EVENT = "clarity-theme-change";

function readIsDark(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.documentElement.classList.contains("dark");
}

function applyDark(next: boolean): void {
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  } catch {
    // Quota / privacy mode — class still applied.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Call once at app boot to restore persisted preference. */
export function initDarkModeFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      document.documentElement.classList.toggle("dark", stored === "dark");
    }
  } catch {
    // ignore
  }
}

export function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(readIsDark);

  useEffect(() => {
    const onChange = () => setDark(readIsDark());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const toggle = useCallback(() => {
    const next = !readIsDark();
    applyDark(next);
    setDark(next);
  }, []);

  return [dark, toggle];
}
