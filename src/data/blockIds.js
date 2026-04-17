import enUs from '../Igneous 1.19.4/assets/minecraft/lang/en_us.json';

export function blockIdToDisplayName(id) {
    const normalizedId = String(id ?? '').trim();
    if (!normalizedId) return '';

    const translated = enUs[`block.minecraft.${normalizedId}`] || enUs[`item.minecraft.${normalizedId}`];
    if (typeof translated === 'string' && translated.trim()) return translated.trim();

    return normalizedId
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
