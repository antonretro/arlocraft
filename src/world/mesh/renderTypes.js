export function usesCombinedTallCross(blockData) {
  return blockData?.renderShape === 'paired_cross_tall';
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

export function resolveChunkGeometry(world, id, blockData) {
  const geo = world.sharedChunkGeometries;
  if (!geo) {
    console.warn(
      '[ArloCraft] sharedChunkGeometries not ready — chunk build deferred'
    );
    return null;
  }
  if (id === 'water' || id.startsWith('water_')) {
    if (id === 'water_top') return geo.water_top ?? geo.solid;
    if (id.startsWith('water_side')) return geo.water_side ?? geo.solid;
    return geo.water ?? geo.solid;
  }
  if (id === 'grass_block_top') return geo.grass_block_top ?? geo.solid;
  if (id === 'grass_block_sides') return geo.solid_no_top ?? geo.solid;
  if (id === 'path_block' || id === 'dirt_path') return geo.path ?? geo.solid;
  if (id === 'farmland') return geo.farmland ?? geo.solid;
  if (id === 'cake') return geo.cake ?? geo.solid;
  if (blockData?.renderType === 'flat' || blockData?.flat)
    return geo.flat ?? geo.deco ?? geo.solid;
  if (
    blockData?.renderType === 'plant' ||
    blockData?.renderType === 'paired_plant' ||
    blockData?.deco
  ) {
    return geo.deco ?? geo.solid;
  }
  if (id.includes(':top')) return geo.face_top ?? geo.solid;
  if (id.includes(':bottom')) return geo.face_bottom ?? geo.solid;
  if (id.includes(':nx')) return geo.face_nx ?? geo.solid;
  if (id.includes(':px')) return geo.face_px ?? geo.solid;
  if (id.includes(':nz')) return geo.face_nz ?? geo.solid;
  if (id.includes(':pz')) return geo.face_pz ?? geo.solid;

  return geo.solid ?? null;
}

export function resolveLODGeometry(world, blockData) {
  if (!blockData) return null;
  const geo = world.sharedChunkGeometries;
  if (!geo) return null;
  if (blockData.renderType === 'paired_plant')
    return geo.tallDecoLOD ?? geo.decoLOD ?? null;
  return geo.decoLOD ?? null;
}

export const DECO_LOD_DIST_SQ = 20 * 20; // 20 blocks as requested

export function isDecoType(blockData) {
  return (
    blockData?.renderType === 'plant' ||
    blockData?.renderType === 'paired_plant' ||
    blockData?.deco
  );
}

export function shouldSkipChunkBlockInstance({
  world,
  id,
  blockData,
  ax,
  ay,
  az,
  isNear,
}) {
  if (id === 'water') {
    const above = world.state.blockMap.get(world.getKey(ax, ay + 1, az));
    if (above === 'water') return true;
  }

  if (!isNear) {
    const nx = world.state.blockMap.get(world.getKey(ax + 1, ay, az));
    const px = world.state.blockMap.get(world.getKey(ax - 1, ay, az));
    const ny = world.state.blockMap.get(world.getKey(ax, ay + 1, az));
    const py = world.state.blockMap.get(world.getKey(ax, ay - 1, az));
    const nz = world.state.blockMap.get(world.getKey(ax, ay, az + 1));
    const pz = world.state.blockMap.get(world.getKey(ax, ay, az - 1));

    if (nx && px && ny && py && nz && pz) {
      if (
        world.isBlockSolid(nx) &&
        world.isBlockSolid(px) &&
        world.isBlockSolid(ny) &&
        world.isBlockSolid(py) &&
        world.isBlockSolid(nz) &&
        world.isBlockSolid(pz)
      ) {
        return true;
      }
    }
  }

  return false;
}
