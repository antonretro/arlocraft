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
    if (id === 'water' || id.startsWith('water_')) {
        if (id === 'water_top') return world.sharedChunkGeometries.water_top;
        if (id.startsWith('water_side')) return world.sharedChunkGeometries.water_side;
        return world.sharedChunkGeometries.water;
    }
    if (id === 'grass_block_top') return world.sharedChunkGeometries.grass_block_top;
    if (id === 'grass_block_sides') return world.sharedChunkGeometries.solid_no_top;
    
    if (id === 'path_block') return world.sharedChunkGeometries.path;
    if (blockData?.renderType === 'flat' || blockData?.flat) return world.sharedChunkGeometries.flat;
    if (blockData?.renderType === 'plant' || blockData?.renderType === 'paired_plant' || blockData?.deco) {
        return world.sharedChunkGeometries.deco;
    }
    if (id.includes('_stairs')) return world.sharedChunkGeometries.stair;
    if (blockData?.renderType === 'slab' || id.includes('_slab') || blockData?.slab) {
        return world.sharedChunkGeometries.slab;
    }
    return world.sharedChunkGeometries.solid;
}

export const DECO_LOD_DIST_SQ = 20 * 20; // 20 blocks as requested

export function isDecoType(blockData) {
    return blockData?.renderType === 'plant' || blockData?.renderType === 'paired_plant' || blockData?.deco;
}

export function resolveLODGeometry(world, blockData) {
    if (!blockData) return null;
    if (blockData.renderType === 'paired_plant') return world.sharedChunkGeometries.tallDecoLOD;
    return world.sharedChunkGeometries.decoLOD;
}

export function shouldSkipChunkBlockInstance({ world, id, blockData, ax, ay, az, isNear }) {

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
