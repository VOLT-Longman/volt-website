const FIELDS = {
  events: { title: 200, description: 20000, type: 20, status: 20, dateLabel: 80 },
  gallery: { title: 200, description: 20000, category: 40 },
  partners: { name: 200, region: 80, game: 80, focus: 120, description: 20000, established: 80 },
  leadership: { name: 80, role: 160, description: 4000, duties: 2000 },
  timeline: { title: 200, description: 4000, dateLabel: 40 }
};

function parse(value) {
  try { const parsed = JSON.parse(value || '{}'); return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : {}; }
  catch { return {}; }
}

export function localizationInput(collection, body, existing = {}) {
  const values = parse(existing.translations_json);
  for (const [field, max] of Object.entries(FIELDS[collection])) {
    const key = `${field}En`;
    if (!Object.hasOwn(body, key) && !Object.hasOwn(body, `${field}_en`)) continue;
    const value = body[key] ?? body[`${field}_en`] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid localized field: ${key}`);
    values[field] = value.trim();
  }
  if (collection === 'leadership') {
    for (const field of ['competencies', 'details']) {
      const key = `${field}En`;
      if (!Object.hasOwn(body, key)) continue;
      let value = body[key];
      if (typeof value === 'string') {
        if (value.length > 20000) throw new Error(`Invalid localized field: ${key}`);
        if (!value.trim()) value = [];
        else { try { value = JSON.parse(value); } catch { throw new Error(`${key}: JSON array required`); } }
      }
      if (!Array.isArray(value) || value.length > 40) throw new Error(`${key}: JSON array required`);
      const valid = field === 'competencies'
        ? value.every((item) => typeof item === 'string' && item.length <= 2000)
        : value.every((item) => item && typeof item.title === 'string' && item.title.length <= 200 && typeof item.content === 'string' && item.content.length <= 4000);
      if (!valid) throw new Error(`Invalid localized field: ${key}`);
      values[field] = field === 'details' ? value.map(({ title, content }) => ({ title, content })) : value;
    }
  }
  return JSON.stringify(values);
}

export function mapLocalization(collection, row) {
  const values = parse(row.translations_json);
  const mapped = {};
  for (const field of Object.keys(FIELDS[collection])) {
    const text = typeof values[field] === 'string' ? values[field] : '';
    mapped[`${field}En`] = text;
    mapped[`${field}_en`] = text;
  }
  if (collection === 'leadership') {
    mapped.competenciesEn = Array.isArray(values.competencies) ? values.competencies : [];
    mapped.competencies_en = mapped.competenciesEn;
    mapped.detailsEn = Array.isArray(values.details) ? values.details : [];
  }
  return mapped;
}
