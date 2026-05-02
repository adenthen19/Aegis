import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs, DetailHeader, Field, FieldGrid, Section,
} from '@/components/detail-shell';
import type { Project, ProjectStatus } from '@/lib/types';
import { displayCompany, displayName } from '@/lib/display-format';
import ProjectRowActions from '../row-actions';

const STATUS_STYLES: Record<ProjectStatus, string> = {
  pending: 'bg-aegis-gold-50 text-aegis-gray-700 ring-aegis-gold/40',
  upcoming: 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20',
  completed: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
};
const STATUS_DOT: Record<ProjectStatus, string> = {
  pending: 'bg-aegis-gold',
  upcoming: 'bg-aegis-blue',
  completed: 'bg-aegis-gray-300',
};

type ProjectWithClient = Project & { clients: { client_id: string; corporate_name: string } | null };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ project_id: string }>;
}) {
  const { project_id } = await params;
  const supabase = await createClient();

  const [projectRes, clientsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('*, clients ( client_id, corporate_name )')
      .eq('project_id', project_id)
      .maybeSingle(),
    supabase.from('clients').select('client_id, corporate_name').order('corporate_name'),
  ]);

  const project = projectRes.data as unknown as ProjectWithClient | null;
  if (!project) notFound();

  const clientsList = clientsRes.data ?? [];
  const overdue =
    project.deadline &&
    project.status !== 'completed' &&
    new Date(project.deadline).getTime() < Date.now();

  return (
    <div>
      <Breadcrumbs items={[
        { href: '/projects', label: 'Projects' },
        { label: displayName(project.deliverable_name) },
      ]} />

      <DetailHeader
        title={displayName(project.deliverable_name)}
        subtitle={
          project.clients?.corporate_name ? (
            <Link
              href={`/clients/${project.clients.client_id}`}
              className="text-aegis-navy hover:text-aegis-orange"
            >
              {displayCompany(project.clients.corporate_name)}
            </Link>
          ) : undefined
        }
        badges={
          <>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[project.status]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[project.status]}`} />
              {project.status}
            </span>
            {overdue && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-aegis-orange-50 px-2.5 py-0.5 text-xs font-medium text-aegis-orange-600">
                <span className="h-1.5 w-1.5 rounded-full bg-aegis-orange" />
                Overdue
              </span>
            )}
          </>
        }
        actions={<ProjectRowActions row={project} clients={clientsList} />}
      />

      <Section title="Details">
        <FieldGrid>
          <Field label="Deliverable">{displayName(project.deliverable_name)}</Field>
          <Field label="Client">
            {project.clients?.corporate_name ? (
              <Link
                href={`/clients/${project.clients.client_id}`}
                className="text-aegis-navy hover:text-aegis-orange"
              >
                {displayCompany(project.clients.corporate_name)}
              </Link>
            ) : (
              <span className="text-aegis-gray-300">—</span>
            )}
          </Field>
          <Field label="Status"><span className="capitalize">{project.status}</span></Field>
          <Field label="Deadline">
            {project.deadline
              ? new Date(project.deadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
              : <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Created">
            {new Date(project.created_at).toLocaleDateString()}
          </Field>
          <Field label="Updated">
            {new Date(project.updated_at).toLocaleDateString()}
          </Field>
        </FieldGrid>
      </Section>
    </div>
  );
}
