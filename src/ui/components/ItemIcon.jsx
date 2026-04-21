import React, { useMemo } from 'react';
import { iconService } from '../IconService';
import { normalizeBlockVariantId } from '../../data/blockIds';

/**
 * High-fidelity Item Icon component that renders 3D isometric blocks
 * or high-quality 2D sprites based on the item type.
 */
export const ItemIcon = React.memo(({ item, className = "" }) => {
  if (!item) return null;

  const normalizedId = useMemo(() => normalizeBlockVariantId(item.id), [item.id]);
  
  const { block, textureKey, isDeco, isBlockItem, shouldTintGrassFace, shouldTintFoliageIcon, shouldUseGrassSpriteTint } = useMemo(() => {
    const b = iconService.blockById.get(normalizedId);
    const tKey = iconService.getDisplayTextureKey(normalizedId);
    const deco = Boolean(b?.deco);
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
      shouldTintGrassFace: normalizedId === 'grass_block',
      shouldTintFoliageIcon: (deco && (tKey === 'grass' || tKey.includes('grass') || tKey === 'fern')) || tKey.includes('leaves'),
      shouldUseGrassSpriteTint: deco && (tKey === 'grass' || normalizedId === 'short_grass' || normalizedId === 'tall_grass')
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

  // BLOCK ITEM: Render 3D Isometric View
  if (isBlockItem) {
    const set = iconService.getBlockTextureSet(normalizedId);
    if (set && (set.top || set.all || set.side || set.front || set.bottom)) {
      const topTex = set.top || set.all || set.side || set.front || set.bottom;
      const leftTex = set.front || set.side || set.all || set.top || set.bottom;
      const rightTex = set.side || set.front || set.all || set.top || set.bottom;

      return (
        <div className={`item-icon ${shouldTintFoliageIcon ? 'tint-grass' : ''} ${className}`}>
           <div className="iso-icon">
              <div className={`iso-face top ${shouldTintGrassFace ? 'tint-grass-face' : ''}`} style={{ backgroundImage: `url('${topTex}')` }} />
              <div className="iso-face left" style={{ backgroundImage: `url('${leftTex}')` }} />
              <div className="iso-face right" style={{ backgroundImage: `url('${rightTex}')` }} />
           </div>
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
});
