import UploadWizard from '@/components/pmo/UploadWizard';
import ProjectTabs from '@/components/pmo/ProjectTabs';

export const metadata = { title: 'Upload data' };

export default async function UploadPage({ params }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <ProjectTabs slug={slug} />
      <UploadWizard slug={slug} />
    </div>
  );
}
