import React from 'react';
import { iconService } from '../IconService';
import { normalizeBlockVariantId } from '../../data/blockIds';

/**
 * High-fidelity Item Icon component that renders 3D isometric blocks
 * or high-quality 2D sprites based on the item type.
 */
export const ItemIcon = ({ item, className = "" }) => {
  if (!item) return null;

  const normalizedId = normalizeBlockVariantId(item.id);
  const block = iconService.blockById.get(normalizedId);
  const textureKey = iconService.getDisplayTextureKey(normalizedId);
  
  const isDeco = Boolean(block?.deco);
  const isBlockItem = 
    (block && !block.deco) || 
    normalizedId === 'wood' || 
    normalizedId === 'leaves' || 
    normalizedId.startsWith('wood_') || 
    normalizedId.startsWith('leaves_') || 
    normalizedId.includes('_stairs') || 
    normalizedId.includes('_slab');

  const shouldTintGrassFace = normalizedId === 'grass_block';
  const shouldTintFoliageIcon = 
    (isDeco && (textureKey === 'grass' || textureKey.includes('grass') || textureKey === 'fern')) || 
    textureKey.includes('leaves');

  const shouldUseGrassSpriteTint = isDeco && (
    textureKey === 'grass' || 
    normalizedId === 'short_grass' || 
    normalizedId === 'tall_grass'
  );

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
      {item.count > 1 && <span className="item-count">{item.count}</span>}
    </div>
  );
};
