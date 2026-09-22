'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { pmo } from '@/lib/pmo/client';

/** The project's name and the three places you work on it. */
export default function ProjectTabs({ slug }) {
  const pathname = usePathname();
  const [project, setProject] = useState(null);

  useEffect(() => {
    pmo.project(slug).then((data) => setProject(data.project)).catch(() => setProject(null));
  }, [slug]);

  const tabs = [
    { href: `/pmo/${slug}`, label: 'Overview' },
    { href: `/pmo/${slug}/upload`, label: 'Upload data' },
    { href: `/pmo/${slug}/reports`, label: 'Reports' },
  ];

  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold tracking-tight text-pmo-700 md:text-2xl">
        {project?.name ?? 'Project'}
      </h1>
      {project ? (
        <p className="mt-0.5 text-sm text-ink-500">
          {[project.code, project.client, project.location].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      <nav className="mt-3 flex gap-1 border-b border-pmo-200">
        {tabs.map((tab) => {
          const active = tab.href === `/pmo/${slug}` ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-semibold transition ${
                active ? 'border-pmo-600 text-pmo-700' : 'border-transparent text-ink-400 hover:text-pmo-600'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
