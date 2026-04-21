import enUs from './en_us.json';

export function normalizeBlockVariantId(id) {
  const raw = String(id ?? '').trim();
  if (!raw) return '';

  let base = raw;
  if (raw.includes(':')) {
    const parts = raw.split(':');
    if (parts[0] === 'minecraft' || parts[0] === 'arlo') {
        base = parts[1];
    } else {
        base = parts[0];
    }
  }
  
  const dirMatch = base.match(/^(.*)_[nswe]$/);
  if (dirMatch) return dirMatch[1];

  return base;
}

export function blockIdToDisplayName(id) {
  const normalizedId = normalizeBlockVariantId(id);
  if (!normalizedId) return '';

  const translated =
    enUs[`block.minecraft.${normalizedId}`] ||
    enUs[`item.minecraft.${normalizedId}`];
  if (typeof translated === 'string' && translated.trim())
    return translated.trim();

  return normalizedId
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
