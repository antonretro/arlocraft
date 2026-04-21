const TALL_CROSS_SHAPE = 'paired_cross_tall';
export const DECO_LOD_DIST_SQ = 20 * 20;

function hasPrefix(id, prefix) {
  return typeof id === 'string' && id.startsWith(prefix);
}

function hasFaceSuffix(id, suffix) {
  return typeof id === 'string' && id.includes(suffix);
}

function getSharedChunkGeometries(world, warnIfMissing = false) {
  const geo = world?.sharedChunkGeometries ?? null;
  if (!geo && warnIfMissing) {
    console.warn(
      '[ArloCraft] sharedChunkGeometries not ready — chunk build deferred'
    );
  }
  return geo;
}

function isPlantRenderType(blockData) {
  const renderType = blockData?.renderType;
  const id = String(blockData?.id || '').toLowerCase();
  return (
    renderType === 'plant' ||
    renderType === 'paired_plant' ||
    blockData?.deco === true ||
    id.includes('mushroom') ||
    id.includes('flower')
  );
}

export function isPaneType(blockData) {
  const renderType = blockData?.renderType;
  const id = String(blockData?.id || '').toLowerCase();
  return renderType === 'pane' || id === 'iron_bars' || id.includes('_pane');
}

function isSolidNeighbor(world, x, y, z) {
  const neighborId = world.state.blockMap.get(world.getKey(x, y, z));
  return neighborId ? world.isBlockSolid(neighborId) : false;
}

export function usesCombinedTallCross(blockData) {
  return blockData?.renderShape === TALL_CROSS_SHAPE;
}

export function isCombinedTallCrossRoot(blockData) {
  return usesCombinedTallCross(blockData) && Number(blockData?.pairOffsetY) > 0;
}

export function isCombinedTallCrossTop(blockData) {
  return usesCombinedTallCross(blockData) && Number(blockData?.pairOffsetY) < 0;
}

export function shouldSkipStandaloneTypeRender(blockData) {
  return isCombinedTallCrossTop(blockData);
}

export function isDecoType(blockData) {
  return isPlantRenderType(blockData) || blockData?.renderType === 'sign';
}

export function resolveChunkGeometry(world, id, blockData) {
  const geo = getSharedChunkGeometries(world, true);
  if (!geo || typeof id !== 'string') return null;

  if (id === 'water' || hasPrefix(id, 'water_')) {
    if (id === 'water_top') return geo.water_top ?? geo.solid ?? null;
    if (hasPrefix(id, 'water_side')) return geo.water_side ?? geo.solid ?? null;
    return geo.water ?? geo.solid ?? null;
  }

  if (hasPrefix(id, 'farmland')) {
    return geo.farmland ?? geo.solid ?? null;
  }

  if (hasPrefix(id, 'grass_block_top')) {
    return geo.grass_block_top ?? geo.face_top ?? geo.solid ?? null;
  }

  if (hasPrefix(id, 'path_block') || hasPrefix(id, 'dirt_path')) {
    return geo.path ?? geo.solid ?? null;
  }

  if (id === 'cake') {
    return geo.cake ?? geo.solid ?? null;
  }

  if (blockData?.renderType === 'flat' || blockData?.flat === true) {
    return geo.flat ?? geo.deco ?? geo.solid ?? null;
  }

  if (isPlantRenderType(blockData)) {
    if (blockData?.renderShape === TALL_CROSS_SHAPE) {
      return geo.tallDeco ?? geo.deco ?? geo.solid ?? null;
    }
    return geo.deco ?? geo.solid ?? null;
  }

  if (hasFaceSuffix(id, ':top')) return geo.face_top ?? geo.solid ?? null;
  if (hasFaceSuffix(id, ':bottom')) return geo.face_bottom ?? geo.solid ?? null;
  if (hasFaceSuffix(id, ':nx')) return geo.face_nx ?? geo.solid ?? null;
  if (hasFaceSuffix(id, ':px')) return geo.face_px ?? geo.solid ?? null;
  if (hasFaceSuffix(id, ':nz')) return geo.face_nz ?? geo.solid ?? null;
  if (hasFaceSuffix(id, ':pz')) return geo.face_pz ?? geo.solid ?? null;

  if (blockData?.renderType === 'slab' || id.includes('_slab')) {
    return geo.slab ?? geo.solid ?? null;
  }
  if (blockData?.renderType === 'stairs' || id.includes('_stairs')) {
    return geo.stair ?? geo.solid ?? null;
  }
  
  if (blockData?.renderType === 'sign' || id.includes('_sign')) {
    return geo.sign ?? geo.deco ?? geo.solid ?? null;
  }

  return geo.solid ?? null;
}

export function resolveLODGeometry(world, blockData) {
  if (!blockData || !isPlantRenderType(blockData)) return null;

  const geo = getSharedChunkGeometries(world, false);
  if (!geo) return null;

  if (blockData?.renderShape === TALL_CROSS_SHAPE) {
    return geo.tallDeco ?? geo.deco ?? null;
  }

  return geo.deco ?? null;
}

export function shouldSkipChunkBlockInstance({
  world,
  id,
  ax,
  ay,
  az,
  isNear,
}) {
  if (id === 'water') {
    const above = world.state.blockMap.get(world.getKey(ax, ay + 1, az));
    if (above === 'water') return true;
  }

  if (isNear) return false;

  const fullySurroundedBySolid =
    isSolidNeighbor(world, ax + 1, ay, az) &&
    isSolidNeighbor(world, ax - 1, ay, az) &&
    isSolidNeighbor(world, ax, ay + 1, az) &&
    isSolidNeighbor(world, ax, ay - 1, az) &&
    isSolidNeighbor(world, ax, ay, az + 1) &&
    isSolidNeighbor(world, ax, ay, az - 1);

  return fullySurroundedBySolid;
}
