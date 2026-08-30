'use client';

const STORAGE_KEY = 'ffo-theme';

/**
 * Dark/light toggle.
 *
 * Deliberately stateless. The current theme lives in one place — the `dark` class on
 * <html>, set before paint by THEME_INIT_SCRIPT — so the button reads it via CSS rather
 * than mirroring it into React state. That avoids both a hydration mismatch (the server
 * cannot know the user's theme) and a setState-in-effect cascade.
 */
export function ThemeToggle() {
  const toggle = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Private browsing can throw on write; the toggle still works for this session.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <span className="dark:hidden" aria-hidden>
        🌙
      </span>
      <span className="hidden dark:inline" aria-hidden>
        ☀️
      </span>
    </button>
  );
}

/** Runs before paint to avoid a flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored === null && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;
