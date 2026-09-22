import { Suspense } from 'react';
import ReportRunner from '@/components/pmo/ReportRunner';
import ProjectTabs from '@/components/pmo/ProjectTabs';

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ params }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ProjectTabs slug={slug} />
      <Suspense fallback={<p className="text-sm text-ink-400">Loading…</p>}>
        <ReportRunner slug={slug} />
      </Suspense>
    </div>
  );
}
