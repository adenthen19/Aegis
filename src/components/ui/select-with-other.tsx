'use client';

import { useState } from 'react';

const OTHER_VALUE = '__other__';

const inputClass =
  'w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';

type Option = { value: string; label: string };

type Props = {
  name: string;
  label: string;
  options: ReadonlyArray<Option>;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
  placeholder?: string;
  otherPlaceholder?: string;
  otherLabel?: string;
  /** When true, "— None —" is selectable for an empty value (only meaningful when not required). */
  clearable?: boolean;
};

export default function SelectWithOther({
  name,
  label,
  options,
  required,
  defaultValue = '',
  hint,
  placeholder = 'Select…',
  otherPlaceholder = 'Type the company name',
  otherLabel = 'Other (specify below)',
  clearable,
}: Props) {
  const inList = !!defaultValue && options.some((o) => o.value === defaultValue);

  const [selected, setSelected] = useState<string>(
    !defaultValue ? '' : inList ? defaultValue : OTHER_VALUE,
  );
  const [other, setOther] = useState<string>(inList || !defaultValue ? '' : defaultValue);

  const showOther = selected === OTHER_VALUE;
  const finalValue = showOther ? other.trim() : selected;

  return (
    <div>
      <label htmlFor={`${name}-select`} className={labelClass}>
        {label} {required && <span className="ml-0.5 text-aegis-orange">*</span>}
      </label>
      <select
        id={`${name}-select`}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        required={required}
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
        <option value={OTHER_VALUE}>{otherLabel}</option>
      </select>

      {showOther && (
        <input
          type="text"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder={otherPlaceholder}
          required={required}
          autoFocus
          maxLength={255}
          className={`${inputClass} mt-2`}
        />
      )}

      {/* The single value posted with the form. */}
      <input type="hidden" name={name} value={finalValue} />

      {hint && <p className="mt-1 text-[11px] text-aegis-gray-300">{hint}</p>}
    </div>
  );
}
