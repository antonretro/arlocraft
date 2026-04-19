import { BLOCKS } from '../../data/blocks.js';
import { TOOLS } from '../../data/tools.js';
import { normalizeBlockVariantId } from '../../data/blockIds.js';

export class BlockRulesService {
    constructor(world) {
        this.world = world;
        
        this.blockXpById = new Map(BLOCKS.map((block) => [block.id, block.xp ?? 0]));
        this.blockHardnessById = new Map(BLOCKS.map((block) => [block.id, block.hardness ?? 1]));
        this.blockDataById = new Map(BLOCKS.map((block) => [block.id, block]));
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
        
        this.reversePairById = new Map();
        this._initPairs();
        
        this.gravityBlockIds = new Set(['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'mangrove_log', 'crystal_log', 'redwood_log', 'acacia_log', 'dark_oak_log', 'cherry_log']);
    }

    _initPairs() {
        for (const block of BLOCKS) {
            const pairId = typeof block?.pairId === 'string' && block.pairId.trim()
                ? block.pairId.trim()
                : null;
            const pairOffsetY = Number(block?.pairOffsetY);
            if (!pairId || !Number.isFinite(pairOffsetY) || pairOffsetY === 0) continue;
            if (!this.reversePairById.has(pairId)) {
                this.reversePairById.set(pairId, { pairId: block.id, pairOffsetY: -pairOffsetY });
            }
        }
    }

    getBlockData(id) {
        if (!id) return null;
        return this.blockDataById.get(normalizeBlockVariantId(id));
    }

    isBlockSolid(id) {
        if (!id || id === 'water' || id === 'air' || id === 'virus') return false;
        const data = this.getBlockData(id);
        if (data?.deco || data?.transparent) {
             // Exception: glass/slabs/stairs might be technically solid but transparent.
             // Usually 'solid' in this engine means 'opaquely fills the cube'.
             if (id.includes('glass') || id.includes('slab') || id.includes('stair')) return true;
             return false;
        }
        return true;
    }

    isSolid(id) {
        return this.isBlockSolid(id);
    }

    computeMineDuration(blockId, selectedItem, mode) {
        if (mode === 'CREATIVE') return 0;

        const hardness = Math.max(0.15, Number(this.blockHardnessById.get(normalizeBlockVariantId(blockId)) ?? 1));
        let efficiency = 1;
        if (selectedItem?.id) {
            const tool = this.toolById.get(selectedItem.id);
            if (tool) efficiency += Math.max(0, Number(tool.efficiency) || 0);
        }
        return Math.max(0.12, (hardness * 0.9) / efficiency);
    }

    isReplaceableForPlacement(id) {
        if (!id || id === 'water' || id === 'air' || id === 'virus' || id === 'fire') return true;
        const data = this.getBlockData(normalizeBlockVariantId(id));
        return Boolean(data?.deco);
    }

    isGravityBlock(id) {
        if (!id) return false;
        const normalizedId = normalizeBlockVariantId(id);
        if (this.gravityBlockIds.has(normalizedId)) return true;
        if (normalizedId.includes('leaves')) return true;
        return false;
    }

    getBlockDropId(id) {
        const normalizedId = normalizeBlockVariantId(id);
        const data = this.getBlockData(normalizedId);
        return data?.dropId || normalizedId;
    }

    getBlockPairState(id, x, y, z) {
        const data = this.getBlockData(id);
        let pairId = data?.pairId;
        let pairOffsetY = Number(data?.pairOffsetY);

        if (!pairId || !Number.isFinite(pairOffsetY) || pairOffsetY === 0) {
            const reversePair = this.reversePairById.get(id);
            if (reversePair) {
                pairId = reversePair.pairId;
                pairOffsetY = Number(reversePair.pairOffsetY);
            }
        }
        
        if (!pairId || !Number.isFinite(pairOffsetY) || pairOffsetY === 0) return null;
        
        const pairY = y + pairOffsetY;
        return { pairId, pairY };
    }

    getBlockXP(id) {
        return this.blockXpById.get(normalizeBlockVariantId(id)) ?? 0;
    }

    getBlockPickId(id) {
        if (id === 'potato') return 'potato_stage3';
        if (id === 'carrot') return 'carrot_stage3';
        if (id === 'beetroot') return 'beetroot_stage3';
        if (id === 'wheat') return 'wheat_stage7';
        
        const normalizedId = normalizeBlockVariantId(id);
        const data = this.getBlockData(normalizedId);
        return data?.pickId || normalizedId;
    }
}
