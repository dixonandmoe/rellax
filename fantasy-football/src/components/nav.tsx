'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/my-team', label: 'My Team', icon: '🛡️' },
  { href: '/league', label: 'League', icon: '🏆' },
  { href: '/draft', label: 'Draft Assistant', icon: '🎯' },
  { href: '/players', label: 'Players', icon: '📊' },
  { href: '/waivers', label: 'Waivers', icon: '💰' },
  { href: '/trades', label: 'Trades', icon: '🔁' },
  { href: '/matchups', label: 'Matchups', icon: '⚔️' },
  { href: '/playoffs', label: 'Playoffs', icon: '🥇' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/espn', label: 'ESPN Connection', icon: '🔌' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <span aria-hidden>{link.icon}</span>
            <span className="whitespace-nowrap">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
