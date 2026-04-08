/**
 * Registry for pre-defined voxel structures (Discovery Structures).
 */
export const STRUCTURES = {
    ruined_tower: {
        width: 5, height: 12, depth: 5,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dy = 0; dy < 12; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist > 1.8 && dist < 2.5) {
                            // Ruined effect: random holes
                            if (Math.random() < 0.15 && dy > 2) continue;
                            blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'stone' });
                        }
                    }
                }
            }
            return blocks;
        }
    },
    desert_pyramid: {
        biomes: ['desert'],
        width: 11, height: 6, depth: 11,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dy = 0; dy < 6; dy++) {
                const size = 5 - dy;
                for (let dx = -size; dx <= size; dx++) {
                    for (let dz = -size; dz <= size; dz++) {
                        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'sandstone' });
                    }
                }
            }
            return blocks;
        }
    },
    village_hut: {
        biomes: ['plains', 'forest'],
        width: 4, height: 4, depth: 4,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dy = 0; dy < 3; dy++) {
                for (let dx = -1; dx <= 2; dx++) {
                    for (let dz = -1; dz <= 2; dz++) {
                        const isWall = dx === -1 || dx === 2 || dz === -1 || dz === 2;
                        if (isWall) blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: dy === 0 ? 'stone' : 'wood' });
                    }
                }
            }
            // Roof
            for (let dx = -2; dx <= 3; dx++) {
                for (let dz = -2; dz <= 3; dz++) {
                    blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'wood' });
                }
            }
            return blocks;
        }
    },
    ancient_temple: {
        width: 7, height: 8, depth: 7,
        blueprints: (x, y, z) => {
            const blocks = [];
            // Base
            for (let dx = -3; dx <= 3; dx++) {
                for (let dz = -3; dz <= 3; dz++) {
                    blocks.push({ x: x + dx, y: y, z: z + dz, id: 'obsidian' });
                }
            }
            // Pillars
            const pillarPos = [[-2,-2], [2,-2], [-2,2], [2,2]];
            for (const [px, pz] of pillarPos) {
                for (let dy = 1; dy < 6; dy++) {
                    blocks.push({ x: x + px, y: y + dy, z: z + pz, id: 'stone' });
                }
            }
            // Top gem
            blocks.push({ x, y: y + 7, z, id: 'ruby' });
            return blocks;
        }
    },
    igloo: {
        biomes: ['highlands'],
        width: 5, height: 4, depth: 5,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist > 1.8 && dist < 2.5) {
                            blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'snow_block' });
                        }
                    }
                }
            }
            return blocks;
        }
    },
    forest_shrine: {
        biomes: ['forest', 'swamp'],
        width: 3, height: 4, depth: 3,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dy = 0; dy < 3; dy++) {
                blocks.push({ x, y: y + dy, z, id: 'wood_willow' });
            }
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'leaves_willow' });
                }
            }
            blocks.push({ x, y, z: z + 1, id: 'crafting_table' });
            return blocks;
        }
    },
    abandoned_camp: {
        width: 5, height: 2, depth: 5,
        blueprints: (x, y, z) => {
            const blocks = [];
            blocks.push({ x, y, z, id: 'coal' }); // Fire pit mockup
            blocks.push({ x: x + 1, y, z: z + 2, id: 'wool_white' });
            blocks.push({ x: x + 2, y, z: z + 2, id: 'wool_white' });
            blocks.push({ x: x + 1, y: y + 1, z: z + 2, id: 'wool_white' });
            return blocks;
        }
    },
    stone_henge: {
        width: 8, height: 4, depth: 8,
        blueprints: (x, y, z) => {
            const blocks = [];
            const circle = [[3,0], [-3,0], [0,3], [0,-3]];
            for (const [cx, cz] of circle) {
                for (let dy = 0; dy < 3; dy++) {
                    blocks.push({ x: x + cx, y: y + dy, z: z + cz, id: 'stone' });
                }
            }
            return blocks;
        }
    },
    void_obelisk: {
        width: 1, height: 10, depth: 1,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dy = 0; dy < 10; dy++) {
                blocks.push({ x, y: y + dy, z, id: dy === 9 ? 'amethyst' : 'obsidian' });
            }
            return blocks;
        }
    },
    monument: {
        biomes: ['plains', 'highlands'],
        width: 5, height: 5, depth: 5,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    for (let dy = 0; dy < 5; dy++) {
                        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) {
                            blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'gold' });
                        }
                    }
                }
            }
            return blocks;
        }
    },
    windmill_outpost: {
        biomes: ['plains', 'forest'],
        width: 9, height: 10, depth: 9,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    blocks.push({ x: x + dx, y, z: z + dz, id: 'cobblestone' });
                }
            }
            for (let dy = 1; dy <= 6; dy++) {
                blocks.push({ x, y: y + dy, z, id: 'wood_planks' });
            }
            const bladeY = y + 6;
            for (let b = -3; b <= 3; b++) {
                blocks.push({ x: x + b, y: bladeY, z, id: 'wood_planks' });
                blocks.push({ x, y: bladeY, z: z + b, id: 'wood_planks' });
            }
            blocks.push({ x, y: bladeY + 1, z, id: 'lantern' });
            return blocks;
        }
    },
    market_stall: {
        biomes: ['plains', 'forest'],
        width: 7, height: 5, depth: 5,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    blocks.push({ x: x + dx, y, z: z + dz, id: 'path_block' });
                }
            }
            const posts = [[-2, -1], [2, -1], [-2, 1], [2, 1]];
            for (const [px, pz] of posts) {
                blocks.push({ x: x + px, y: y + 1, z: z + pz, id: 'wood_planks' });
                blocks.push({ x: x + px, y: y + 2, z: z + pz, id: 'wood_planks' });
                blocks.push({ x: x + px, y: y + 3, z: z + pz, id: 'lantern' });
            }
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'wool_red' });
                }
            }
            blocks.push({ x, y: y + 1, z, id: 'starter_chest' });
            return blocks;
        }
    },
    blacksmith_forge: {
        biomes: ['plains', 'highlands', 'forest'],
        width: 7, height: 5, depth: 7,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    blocks.push({ x: x + dx, y, z: z + dz, id: 'cobblestone' });
                    if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
                        blocks.push({ x: x + dx, y: y + 1, z: z + dz, id: 'stone' });
                    }
                }
            }
            blocks.push({ x, y: y + 1, z, id: 'furnace' });
            blocks.push({ x: x + 1, y: y + 1, z, id: 'obsidian' });
            blocks.push({ x: x - 1, y: y + 1, z, id: 'lantern' });
            return blocks;
        }
    },
    village_well: {
        biomes: ['plains', 'forest', 'desert'],
        width: 7, height: 6, depth: 7,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const ring = Math.abs(dx) === 2 || Math.abs(dz) === 2;
                    blocks.push({ x: x + dx, y, z: z + dz, id: ring ? 'cobblestone' : 'water' });
                }
            }
            const posts = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
            for (const [px, pz] of posts) {
                for (let dy = 1; dy <= 3; dy++) {
                    blocks.push({ x: x + px, y: y + dy, z: z + pz, id: 'wood_planks' });
                }
            }
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    blocks.push({ x: x + dx, y: y + 4, z: z + dz, id: 'wood_planks' });
                }
            }
            return blocks;
        }
    },
    mine_entrance: {
        biomes: ['highlands', 'forest'],
        width: 7, height: 6, depth: 9,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dz = -1; dz <= 3; dz++) {
                blocks.push({ x, y, z: z + dz, id: 'path_block' });
                blocks.push({ x: x - 1, y, z: z + dz, id: 'cobblestone' });
                blocks.push({ x: x + 1, y, z: z + dz, id: 'cobblestone' });
            }
            for (let dy = 1; dy <= 3; dy++) {
                blocks.push({ x: x - 2, y: y + dy, z: z - 1, id: 'cobblestone' });
                blocks.push({ x: x + 2, y: y + dy, z: z - 1, id: 'cobblestone' });
            }
            for (let dx = -2; dx <= 2; dx++) {
                blocks.push({ x: x + dx, y: y + 4, z: z - 1, id: 'stone' });
            }
            blocks.push({ x: x - 1, y: y + 2, z: z, id: 'lantern' });
            blocks.push({ x: x + 1, y: y + 2, z: z, id: 'lantern' });
            return blocks;
        }
    },
    ruined_bridge: {
        biomes: ['plains', 'highlands', 'desert', 'swamp'],
        width: 15, height: 4, depth: 5,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -7; dx <= 7; dx++) {
                if (dx === -1 || dx === 2 || dx === 5) continue;
                blocks.push({ x: x + dx, y, z, id: 'cobblestone' });
                if (Math.abs(dx) % 3 === 0) {
                    blocks.push({ x: x + dx, y: y + 1, z, id: 'wood_planks' });
                }
            }
            blocks.push({ x: x - 6, y: y + 2, z, id: 'lantern' });
            blocks.push({ x: x + 6, y: y + 2, z, id: 'lantern' });
            return blocks;
        }
    },
    desert_oasis_shrine: {
        biomes: ['desert'],
        width: 9, height: 6, depth: 9,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -3; dx <= 3; dx++) {
                for (let dz = -3; dz <= 3; dz++) {
                    const border = Math.abs(dx) === 3 || Math.abs(dz) === 3;
                    blocks.push({ x: x + dx, y, z: z + dz, id: border ? 'sandstone' : 'water' });
                }
            }
            for (let dy = 1; dy <= 3; dy++) {
                blocks.push({ x: x - 4, y: y + dy, z: z - 4, id: 'wood_palm' });
                blocks.push({ x: x + 4, y: y + dy, z: z + 4, id: 'wood_palm' });
            }
            blocks.push({ x: x - 4, y: y + 4, z: z - 4, id: 'leaves_palm' });
            blocks.push({ x: x + 4, y: y + 4, z: z + 4, id: 'leaves_palm' });
            blocks.push({ x, y: y + 1, z, id: 'lantern' });
            return blocks;
        }
    },
    fishing_dock: {
        biomes: ['swamp', 'plains'],
        width: 9, height: 4, depth: 11,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dz = -1; dz <= 5; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    blocks.push({ x: x + dx, y, z: z + dz, id: 'wood_planks' });
                }
                blocks.push({ x: x - 1, y: y - 1, z: z + dz, id: 'wood' });
                blocks.push({ x: x + 1, y: y - 1, z: z + dz, id: 'wood' });
            }
            blocks.push({ x, y: y + 1, z: z + 5, id: 'lantern' });
            blocks.push({ x, y: y + 1, z: z + 2, id: 'starter_chest' });
            return blocks;
        }
    },
    wizard_tower: {
        biomes: ['highlands', 'forest'],
        width: 7, height: 12, depth: 7,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dy = 0; dy < 10; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const ring = Math.abs(dx) === 2 || Math.abs(dz) === 2;
                        if (!ring) continue;
                        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'stone' });
                    }
                }
            }
            for (let dx = -3; dx <= 3; dx++) {
                for (let dz = -3; dz <= 3; dz++) {
                    if (Math.abs(dx) + Math.abs(dz) > 5) continue;
                    blocks.push({ x: x + dx, y: y + 10, z: z + dz, id: 'obsidian' });
                }
            }
            blocks.push({ x, y: y + 11, z, id: 'amethyst' });
            return blocks;
        }
    },
    graveyard_crypt: {
        biomes: ['plains', 'highlands', 'forest'],
        width: 11, height: 6, depth: 9,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -4; dx <= 4; dx++) {
                blocks.push({ x: x + dx, y, z, id: 'path_block' });
            }
            const graves = [[-3, -2], [-1, -2], [1, -2], [3, -2], [-2, 2], [2, 2]];
            for (const [gx, gz] of graves) {
                blocks.push({ x: x + gx, y: y + 1, z: z + gz, id: 'stone' });
                blocks.push({ x: x + gx, y: y + 2, z: z + gz, id: 'stone' });
            }
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = 3; dz <= 5; dz++) {
                    blocks.push({ x: x + dx, y: y + 1, z: z + dz, id: 'obsidian' });
                }
            }
            blocks.push({ x, y: y + 2, z: z + 5, id: 'lantern' });
            return blocks;
        }
    },
    orchard_grove: {
        biomes: ['plains', 'forest'],
        width: 13, height: 8, depth: 13,
        blueprints: (x, y, z) => {
            const blocks = [];
            const trunks = [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 0]];
            for (const [tx, tz] of trunks) {
                for (let dy = 1; dy <= 3; dy++) {
                    blocks.push({ x: x + tx, y: y + dy, z: z + tz, id: 'wood_cherry' });
                }
                for (let lx = -1; lx <= 1; lx++) {
                    for (let lz = -1; lz <= 1; lz++) {
                        blocks.push({ x: x + tx + lx, y: y + 4, z: z + tz + lz, id: 'leaves_cherry' });
                    }
                }
            }
            for (let px = -5; px <= 5; px++) {
                blocks.push({ x: x + px, y, z, id: 'path_block' });
            }
            return blocks;
        }
    },
    lamp_plaza: {
        biomes: ['plains', 'forest', 'highlands'],
        width: 11, height: 6, depth: 11,
        blueprints: (x, y, z) => {
            const blocks = [];
            for (let dx = -4; dx <= 4; dx++) {
                for (let dz = -4; dz <= 4; dz++) {
                    const isBorder = Math.abs(dx) === 4 || Math.abs(dz) === 4;
                    blocks.push({ x: x + dx, y, z: z + dz, id: isBorder ? 'cobblestone' : 'path_block' });
                }
            }
            const lamps = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
            for (const [lx, lz] of lamps) {
                for (let dy = 1; dy <= 3; dy++) {
                    blocks.push({ x: x + lx, y: y + dy, z: z + lz, id: 'wood_planks' });
                }
                blocks.push({ x: x + lx, y: y + 4, z: z + lz, id: 'lantern' });
            }
            blocks.push({ x, y: y + 1, z, id: 'crafting_table' });
            return blocks;
        }
    },
    mega_rollercoaster: {
        biomes: ['plains', 'forest'],
        width: 31, height: 18, depth: 31,
        blueprints: (x, y, z) => {
            const blocks = [];
            const baseY = y;

            for (let dx = -14; dx <= 14; dx++) {
                for (let dz = -14; dz <= 14; dz++) {
                    if (Math.abs(dx) === 14 || Math.abs(dz) === 14) {
                        blocks.push({ x: x + dx, y: baseY, z: z + dz, id: 'path_block' });
                    }
                }
            }

            const supports = [
                [-12, -12], [12, -12], [-12, 12], [12, 12],
                [0, -12], [0, 12], [-12, 0], [12, 0]
            ];
            for (const [sx, sz] of supports) {
                const height = 8 + Math.floor((Math.abs(sx) + Math.abs(sz)) * 0.2);
                for (let dy = 1; dy <= height; dy++) {
                    blocks.push({ x: x + sx, y: baseY + dy, z: z + sz, id: 'wood_planks' });
                }
                blocks.push({ x: x + sx, y: baseY + height + 1, z: z + sz, id: 'lantern' });
            }

            for (let i = -12; i <= 12; i++) {
                const wave = Math.floor(3 + (Math.sin(i * 0.45) * 3));
                blocks.push({ x: x + i, y: baseY + 10 + wave, z: z - 12, id: 'wood_planks' });
                blocks.push({ x: x + 12, y: baseY + 10 - wave, z: z + i, id: 'wood_planks' });
                blocks.push({ x: x - i, y: baseY + 8 + wave, z: z + 12, id: 'wood_planks' });
                blocks.push({ x: x - 12, y: baseY + 8 - wave, z: z - i, id: 'wood_planks' });
            }

            for (let t = -10; t <= 10; t += 5) {
                blocks.push({ x: x + t, y: baseY + 13, z: z - 12, id: 'wool_red' });
                blocks.push({ x: x + 12, y: baseY + 13, z: z + t, id: 'wool_yellow' });
                blocks.push({ x: x - t, y: baseY + 11, z: z + 12, id: 'wool_blue' });
                blocks.push({ x: x - 12, y: baseY + 11, z: z - t, id: 'wool_green' });
            }

            return blocks;
        }
    },
    spinning_ride: {
        biomes: ['plains', 'forest', 'desert'],
        width: 17, height: 12, depth: 17,
        blueprints: (x, y, z) => {
            const blocks = [];
            const baseY = y;

            for (let dx = -7; dx <= 7; dx++) {
                for (let dz = -7; dz <= 7; dz++) {
                    const ring = Math.abs(dx) === 7 || Math.abs(dz) === 7;
                    blocks.push({ x: x + dx, y: baseY, z: z + dz, id: ring ? 'cobblestone' : 'path_block' });
                }
            }

            for (let dy = 1; dy <= 8; dy++) {
                blocks.push({ x, y: baseY + dy, z, id: 'wood_planks' });
            }
            blocks.push({ x, y: baseY + 9, z, id: 'lantern' });

            for (let arm = 0; arm < 8; arm++) {
                const ang = (arm / 8) * Math.PI * 2;
                const rx = Math.round(Math.cos(ang) * 5);
                const rz = Math.round(Math.sin(ang) * 5);
                blocks.push({ x: x + rx, y: baseY + 7, z: z + rz, id: 'wood_planks' });
                blocks.push({ x: x + rx, y: baseY + 6, z: z + rz, id: 'wool_magenta' });
                blocks.push({ x: x + rx, y: baseY + 5, z: z + rz, id: 'lantern' });
            }

            for (let dx = -5; dx <= 5; dx++) {
                blocks.push({ x: x + dx, y: baseY + 7, z, id: 'wood_planks' });
                blocks.push({ x, y: baseY + 7, z: z + dx, id: 'wood_planks' });
            }

            return blocks;
        }
    }
};
