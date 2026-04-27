'use client';

import {
  DateTimeField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import {
  COVERAGE_SENTIMENT_LABEL,
  COVERAGE_TYPE_LABEL,
  type CoverageSentiment,
  type CoverageType,
  type MediaCoverage,
} from '@/lib/types';

const TYPE_OPTIONS = (
  Object.keys(COVERAGE_TYPE_LABEL) as CoverageType[]
).map((t) => ({ value: t, label: COVERAGE_TYPE_LABEL[t] }));

const SENTIMENT_OPTIONS = (
  Object.keys(COVERAGE_SENTIMENT_LABEL) as CoverageSentiment[]
).map((s) => ({ value: s, label: COVERAGE_SENTIMENT_LABEL[s] }));

export default function CoverageFormFields({
  initial,
  clientId,
  pressReleaseId,
  mediaContacts,
}: {
  initial?: MediaCoverage;
  clientId: string;
  pressReleaseId?: string | null;
  mediaContacts: { media_id: string; full_name: string; company_name: string | null }[];
}) {
  return (
    <>
      {initial && <input type="hidden" name="coverage_id" value={initial.coverage_id} />}
      <input type="hidden" name="client_id" value={clientId} />
      {pressReleaseId && (
        <input type="hidden" name="press_release_id" value={pressReleaseId} />
      )}

      <TextField
        name="publication_name"
        label="Publication"
        required
        placeholder="e.g. The Edge, Bursa Marketplace"
        defaultValue={initial?.publication_name ?? undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="reporter_name"
          label="Reporter"
          placeholder="optional"
          defaultValue={initial?.reporter_name ?? undefined}
        />
        <SelectField
          name="media_id"
          label="Linked media contact"
          clearable
          defaultValue={initial?.media_id ?? ''}
          options={mediaContacts.map((m) => ({
            value: m.media_id,
            label: m.company_name ? `${m.full_name} · ${m.company_name}` : m.full_name,
          }))}
          hint="Optional — falls back to the publication name above."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          name="coverage_type"
          label="Coverage type"
          required
          defaultValue={initial?.coverage_type ?? 'online'}
          options={TYPE_OPTIONS}
        />
        <DateTimeField
          name="publication_date"
          label="Publication date"
          required
          type="date"
          defaultValue={initial?.publication_date ?? undefined}
        />
      </div>

      <TextField
        name="headline"
        label="Headline"
        required
        defaultValue={initial?.headline ?? undefined}
      />

      <TextField
        name="url"
        type="url"
        label="URL (online coverage)"
        placeholder="https://…"
        defaultValue={initial?.url ?? undefined}
        hint="For print or broadcast: leave URL blank and attach the clipping below."
      />

      <div className="rounded-md border border-aegis-gray-100 bg-aegis-gray-50/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-aegis-gray-500">
          Clipping (optional)
        </p>
        <div className="space-y-3">
          <div>
            <label
              htmlFor="clipping_file"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
            >
              Upload PDF / image
            </label>
            <input
              id="clipping_file"
              name="clipping_file"
              type="file"
              accept="application/pdf,image/*"
              className="block w-full text-xs text-aegis-gray file:mr-3 file:rounded-md file:border-0 file:bg-aegis-navy file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-aegis-navy-700"
            />
          </div>
          <p className="text-center text-[10px] uppercase tracking-wide text-aegis-gray-300">or</p>
          <TextField
            name="clipping_url"
            type="url"
            label="External link (Google Drive, etc.)"
            placeholder="https://drive.google.com/…"
            hint="Either upload a file above or paste a link here. Skip if there's no clipping yet."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField
          name="reach_estimate"
          label="Reach"
          min={0}
          defaultValue={
            initial?.reach_estimate != null ? String(initial.reach_estimate) : undefined
          }
          hint="Circulation or page-views."
        />
        <NumberField
          name="ave_value"
          label="AVE value"
          step="0.01"
          min={0}
          defaultValue={initial?.ave_value != null ? String(initial.ave_value) : undefined}
          hint="Advertising Value Equivalent."
        />
        <NumberField
          name="prv_value"
          label="PR value"
          step="0.01"
          min={0}
          defaultValue={initial?.prv_value != null ? String(initial.prv_value) : undefined}
          hint="Reach × engagement × sentiment."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
        <TextField
          name="currency"
          label="Currency"
          placeholder="MYR"
          defaultValue={initial?.currency ?? 'MYR'}
        />
        <SelectField
          name="sentiment"
          label="Sentiment"
          clearable
          defaultValue={initial?.sentiment ?? ''}
          options={SENTIMENT_OPTIONS}
        />
      </div>

      <TextField
        name="tone_tag"
        label="Tone tag"
        placeholder="e.g. factual"
        hint="Add multiple by separating with commas — first tag only for now."
        defaultValue={initial?.tone_tags?.[0] ?? undefined}
      />

      <TextAreaField
        name="notes"
        label="Notes"
        rows={2}
        defaultValue={initial?.notes ?? undefined}
      />
    </>
  );
}
