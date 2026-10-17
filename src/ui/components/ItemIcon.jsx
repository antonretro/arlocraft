import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { iconService } from '../IconService';
import { normalizeBlockVariantId } from '../../data/blockIds';

const FIXED_COLOR_FOLIAGE_IDS = new Set([
  'cherry_leaves',
  'leaves_cherry',
  'flowering_azalea_leaves',
]);

/**
 * High-fidelity Item Icon component that renders 3D isometric blocks
 * or high-quality 2D sprites based on the item type.
 */
// Game code mutates stacks in place (item.count--), so memoize on the values
// the icon shows rather than on the item object's identity.
const MemoItemIcon = React.memo(
  ({ item, className }) => <ItemIconInner item={item} className={className} />,
  (prev, next) =>
    prev.className === next.className &&
    prev.id === next.id &&
    prev.count === next.count &&
    prev.durability === next.durability &&
    prev.kind === next.kind
);

export const ItemIcon = ({ item, className = "" }) => {
  if (!item) return null;
  return (
    <MemoItemIcon
      item={item}
      className={className}
      id={item.id}
      count={item.count}
      durability={item.durability}
      kind={item.kind}
    />
  );
};

const ItemIconInner = ({ item, className }) => {
  const normalizedId = useMemo(() => normalizeBlockVariantId(item.id), [item.id]);

  // Isometric cube icon for full/partial blocks; generated lazily and cached.
  const isoShape = useMemo(() => iconService.getBlockIconShape(normalizedId), [normalizedId]);
  const getIsoSnapshot = useCallback(
    () => (isoShape ? iconService.getCachedBlockIcon(normalizedId) ?? null : null),
    [isoShape, normalizedId]
  );
  const isoIcon = useSyncExternalStore(iconService.subscribeBlockIcons, getIsoSnapshot);
  useEffect(() => {
    if (isoShape && !isoIcon) iconService.requestBlockIcon(normalizedId);
  }, [isoShape, isoIcon, normalizedId]);
  
  const { block, textureKey, isDeco, isBlockItem, shouldTintGrassFace, shouldTintFoliageIcon, shouldUseGrassSpriteTint } = useMemo(() => {
    const b = iconService.blockById.get(normalizedId);
    const tKey = iconService.getDisplayTextureKey(normalizedId);
    const deco = Boolean(b?.deco);
    const hasFixedFoliageColor =
      FIXED_COLOR_FOLIAGE_IDS.has(normalizedId) ||
      FIXED_COLOR_FOLIAGE_IDS.has(tKey);
    const blockItem = 
      (b && !b.deco) || 
      normalizedId === 'wood' || 
      normalizedId === 'leaves' || 
      normalizedId.startsWith('wood_') || 
      normalizedId.startsWith('leaves_') || 
      normalizedId.includes('_stairs') || 
      normalizedId.includes('_slab');

    return {
      block: b,
      textureKey: tKey,
      isDeco: deco,
      isBlockItem: blockItem,
      shouldTintGrassFace: false,
      shouldTintFoliageIcon:
        !hasFixedFoliageColor &&
        ((deco &&
          (tKey === 'grass' ||
            tKey.includes('grass') ||
            tKey === 'fern')) ||
          tKey.includes('leaves')),
      shouldUseGrassSpriteTint:
        !hasFixedFoliageColor &&
        deco &&
        (tKey === 'grass' ||
          normalizedId === 'short_grass' ||
          normalizedId === 'tall_grass')
    };
  }, [normalizedId]);

  const renderDurability = () => {
    if (item.kind !== 'tool' || item.durability === undefined || item.maxDurability === undefined) return null;
    if (item.durability === item.maxDurability) return null;

    const percent = (item.durability / item.maxDurability) * 100;
    const color = percent > 50 ? '#55ff55' : percent > 20 ? '#ffff55' : '#ff5555';
    
    return (
      <div className="absolute bottom-1 left-1 right-1 h-1 bg-black/60 rounded-full overflow-hidden border border-black/20">
        <div 
          className="h-full transition-all duration-300" 
          style={{ width: `${percent}%`, backgroundColor: color }} 
        />
      </div>
    );
  };

  if (isoIcon) {
    return (
      <div
        className={`item-icon block-iso-icon ${className} relative`}
        style={{ backgroundImage: `url('${isoIcon}')` }}
      >
        {renderDurability()}
        {item.count > 1 && <span className="item-count">{item.count}</span>}
      </div>
    );
  }

  // BLOCK ITEM: flat block face while the isometric icon is generated (or for
  // blocks without one). Flat-sprite blocks (rails, ladders…) use the 2D path.
  if (isBlockItem && !iconService.isFlatSpriteBlock(normalizedId)) {
    const blockTexture = iconService.getPreferredBlockIconTexture(normalizedId);
    if (blockTexture) {
      const tintClass = shouldTintGrassFace
        ? 'tint-grass-face'
        : shouldTintFoliageIcon
          ? 'tint-grass'
          : '';

      const isMultiFrame = normalizedId === 'lantern' || normalizedId === 'command_block' || normalizedId.includes('door') || normalizedId.includes('active') || normalizedId.includes('lamp');

      return (
        <div
          className={`item-icon block-sprite-icon ${tintClass} ${className} relative overflow-hidden`}
          style={{
            backgroundImage: `url('${blockTexture}')`,
            backgroundSize: isMultiFrame ? '100% auto' : 'contain',
            backgroundPosition: isMultiFrame ? 'top' : 'center',
          }}
        >
          {renderDurability()}
          {item.count > 1 && <span className="item-count">{item.count}</span>}
        </div>
      );
    }
  }

  // 2D ITEM: Render Flat Sprite
  const icon = iconService.getIconPath(normalizedId);
  const tintClass = shouldUseGrassSpriteTint ? 'tint-grass-sprite' : (shouldTintFoliageIcon ? 'tint-grass' : '');
  const isGenerated = icon && icon.startsWith('data:image/svg+xml');

  return (
    <div 
      className={`item-icon ${tintClass} ${isGenerated ? 'generated' : ''} ${className}`}
      style={{ backgroundImage: icon ? `url('${icon}')` : 'none' }}
    >
      {!icon && <span className="text-[10px] font-bold">{normalizedId.slice(0, 2).toUpperCase()}</span>}
      {renderDurability()}
      {item.count > 1 && <span className="item-count">{item.count}</span>}
    </div>
  );
};
