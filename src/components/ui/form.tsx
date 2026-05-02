'use client';

import { useFormStatus } from 'react-dom';

const inputClass =
  'w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 disabled:cursor-not-allowed disabled:bg-aegis-gray-50';

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-aegis-gray-300">{children}</p>;
}

function Required() {
  return <span className="ml-0.5 text-aegis-orange">*</span>;
}

type BaseProps = {
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  defaultValue?: string;
};

export function TextField({
  name, label, required, hint, defaultValue, placeholder, type = 'text',
}: BaseProps & { placeholder?: string; type?: 'text' | 'email' | 'url' }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label} {required && <Required />}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputClass}
      />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export function NumberField({
  name, label, required, hint, defaultValue, placeholder, step, min, max,
}: BaseProps & { placeholder?: string; step?: string; min?: number; max?: number }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label} {required && <Required />}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        className={`${inputClass} tabular-nums`}
      />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export function SelectField({
  name, label, required, hint, defaultValue, options, placeholder = 'Select…', clearable,
}: BaseProps & {
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  clearable?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label} {required && <Required />}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ''}
        className={inputClass}
      >
        {clearable ? (
          <option value="">— None —</option>
        ) : (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export function DateTimeField({
  name, label, required, hint, defaultValue, type = 'datetime-local',
}: BaseProps & { type?: 'date' | 'datetime-local' }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label} {required && <Required />}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={inputClass}
      />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export function TextAreaField({
  name, label, required, hint, defaultValue, placeholder, rows = 3,
}: BaseProps & { placeholder?: string; rows?: number }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label} {required && <Required />}
      </label>
      <textarea
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={rows}
        className={`${inputClass} resize-y`}
      />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export function CheckboxField({
  name, label, hint, defaultChecked,
}: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label htmlFor={name} className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        value="true"
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border border-aegis-gray-300 text-aegis-navy accent-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
      />
      <span>
        <span className="block text-sm font-medium text-aegis-gray">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-aegis-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

export function MultiCheckboxField({
  name, label, options, required, hint, defaultValues = [],
}: BaseProps & {
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValues?: string[];
}) {
  const checked = new Set(defaultValues);
  return (
    <div>
      <label className={labelClass}>
        {label} {required && <Required />}
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2.5">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={checked.has(o.value)}
              className="h-4 w-4 cursor-pointer rounded border border-aegis-gray-300 text-aegis-navy accent-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
            />
            <span className="text-sm text-aegis-gray">{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-3.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export function FormActions({
  onCancel,
  submitLabel = 'Create',
  pendingLabel = 'Saving…',
}: {
  onCancel: () => void;
  // Static label for the submit button. Override to e.g. 'Update' on edit
  // modals so the action matches the form's intent.
  submitLabel?: string;
  // Label while the action is in flight. Defaults to 'Saving…' which works
  // for both create and update; override only when the verb really differs.
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-aegis-orange-600 disabled:opacity-60"
      >
        {pending && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {pending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}

export function JsonField({
  name, label, hint, defaultValue, rows = 5, placeholder,
}: BaseProps & { rows?: number; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder ?? '{ }'}
        rows={rows}
        spellCheck={false}
        className={`${inputClass} resize-y font-mono text-xs`}
      />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-aegis-orange-600 sm:w-auto sm:py-2"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  );
}
