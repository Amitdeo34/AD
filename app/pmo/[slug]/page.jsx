import Cockpit from '@/components/pmo/Cockpit';
import ProjectTabs from '@/components/pmo/ProjectTabs';

export default async function ProjectPage({ params }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ProjectTabs slug={slug} />
      <Cockpit slug={slug} />
    </div>
  );
}
