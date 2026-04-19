/**
 * Simulated History Version Definitions.
 * These eras toggle feature flags to mimic previous development milestones.
 */
export const VERSIONS = [
    {
        id: 'v0.1',
        name: 'Classic Prototype (v0.1)',
        date: '2026-03-10',
        description: 'Where it all began. Simple flat terrain, basic blocks, and gravity physics.',
        archiveUrl: 'https://antonretro.github.io/ArloCraft-v0.1',
        features: {
            caves: false,
            corruption: false,
            survival: false,
            lighting: false,
            minimap: false,
            entities: false
        }
    },
    {
        id: 'v0.4',
        name: 'The Cave Update (v0.4)',
        date: '2026-03-24',
        description: 'Introduced complex cave generation, lighting systems, and expanded biomes.',
        archiveUrl: 'https://antonretro.github.io/ArloCraft-v0.4',
        features: {
            caves: true,
            corruption: false,
            survival: false,
            lighting: true,
            minimap: true,
            entities: false
        }
    },
    {
        id: 'v0.7',
        name: 'Survival & Mobs (v0.7)',
        date: '2026-04-05',
        description: 'The world came to life with hunger, XP, and early entities.',
        archiveUrl: 'https://antonretro.github.io/ArloCraft-v0.7',
        features: {
            caves: true,
            corruption: false,
            survival: true,
            lighting: true,
            minimap: true,
            entities: true
        }
    },
    {
        id: 'v1.0',
        name: 'Release Candidate (v1.0)',
        date: '2026-04-18',
        description: 'The Collector Edition. Features 3D items, log stripping, flintlock muskets, and auto-quality stabilization.',
        archiveUrl: '', // Current version
        features: {
            caves: true,
            corruption: true,
            survival: true,
            lighting: true,
            minimap: true,
            entities: true
        }
    }
];
