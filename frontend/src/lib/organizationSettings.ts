export const ORG_SETTINGS_STORAGE_KEY = 'logbook.organizationSettings';

export type OrganizationSettings = {
  organizationName: string;
  industry: string;
  address: string;
  logoDataUrl: string;
};

export function loadOrganizationSettings(): OrganizationSettings {
  const fallback: OrganizationSettings = {
    organizationName: '',
    industry: '',
    address: '',
    logoDataUrl: '',
  };
  try {
    const raw = localStorage.getItem(ORG_SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<OrganizationSettings> | null;
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      organizationName:
        typeof parsed.organizationName === 'string' ? parsed.organizationName.trim() : '',
      industry: typeof parsed.industry === 'string' ? parsed.industry.trim() : '',
      address: typeof parsed.address === 'string' ? parsed.address.trim() : '',
      logoDataUrl: typeof parsed.logoDataUrl === 'string' ? parsed.logoDataUrl.trim() : '',
    };
  } catch {
    return fallback;
  }
}

export function saveOrganizationSettings(settings: OrganizationSettings): void {
  localStorage.setItem(
    ORG_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      organizationName: String(settings.organizationName || '').trim(),
      industry: String(settings.industry || '').trim(),
      address: String(settings.address || '').trim(),
      logoDataUrl: String(settings.logoDataUrl || '').trim(),
    }),
  );
}

