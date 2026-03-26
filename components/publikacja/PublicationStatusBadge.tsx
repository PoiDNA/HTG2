import type { PublicationStatus } from '@/lib/publication/types';

const STATUS_COLORS: Record<PublicationStatus, string> = {
  raw: 'bg-gray-100 text-gray-700',
  editing: 'bg-blue-100 text-blue-800',
  edited: 'bg-amber-100 text-amber-800',
  mastering: 'bg-purple-100 text-purple-800',
  published: 'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<PublicationStatus, string> = {
  raw: 'Surowy',
  editing: 'W edycji',
  edited: 'Edytowany',
  mastering: 'Mastering',
  published: 'Opublikowany',
};

export function PublicationStatusBadge({
  status,
  labels,
}: {
  status: PublicationStatus;
  labels?: Record<string, string>;
}) {
  const label = labels?.[status] || STATUS_LABELS[status];
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {label}
    </span>
  );
}
