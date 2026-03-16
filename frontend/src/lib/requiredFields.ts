export type RequiredFieldSpec<T extends Record<string, any>> = {
  key: keyof T;
  label: string;
  numeric?: boolean;
  trim?: boolean;
};

export function firstRequiredFieldError<T extends Record<string, any>>(
  data: T,
  fields: RequiredFieldSpec<T>[],
): string | null {
  for (const f of fields) {
    const raw = data[f.key];
    const value =
      typeof raw === 'string' && (f.trim ?? true) ? raw.trim() : raw;

    if (value === '' || value === null || value === undefined) {
      return `Please enter ${f.label}.`;
    }

    if (f.numeric) {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (Number.isNaN(num)) {
        return `${f.label} must be numeric.`;
      }
    }
  }
  return null;
}

