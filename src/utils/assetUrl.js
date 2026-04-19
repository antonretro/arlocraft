export function assetUrl(path) {
    const base = import.meta.env.BASE_URL || './';
    const clean = String(path ?? '').replace(/^\/+/, '');
    if (!clean) return base;
    return `${base}${clean}`;
}

