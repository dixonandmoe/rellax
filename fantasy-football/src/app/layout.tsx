import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { THEME_INIT_SCRIPT, ThemeToggle } from '@/components/theme-toggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fantasy Football Front Office',
  description:
    'Draft assistant and in-season manager that answers "given the state of my league, what should I do next?"',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applied before paint so the page never flashes the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 lg:flex-row lg:p-6">
          <aside className="lg:w-56 lg:shrink-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold tracking-tight">Front Office</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Fantasy Football</p>
              </div>
              <ThemeToggle />
            </div>
            <Nav />
          </aside>
          <main className="min-w-0 flex-1 space-y-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
