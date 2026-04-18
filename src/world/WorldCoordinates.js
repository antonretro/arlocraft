export class WorldCoordinates {
    constructor(config) {
        this.chunkSize = config.chunkSize;
    }

    // Bit-packing constants for 53-bit safe integers
    // X and Z are offset by 1,000,000 to keep them positive (21 bits each)
    // Y is centered around 512 (11 bits)
    // Formula: (x + OFFSET) << 32 | (z + OFFSET) << 11 | (y + 512)
    // Since bitwise in JS is 32-bit, we use multiplication for the higher bits.
    
    getKey(x, y, z) {
        // Safe 53-bit packing: 
        // Y: 10 bits (0-1023) -> Offset 512
        // Z: 21 bits (+/- 1 million) -> Offset 1,048,576
        // X: 21 bits (+/- 1 million) -> Offset 1,048,576
        // Total: 10 + 21 + 21 = 52 bits (Safe < 53)
        const ix = Math.floor(x) + 1048576;
        const iy = Math.floor(y) + 512;
        const iz = Math.floor(z) + 1048576;
        return (ix * 2147483648) + (iz * 1024) + iy; // 2147483648 is 2^31
    }

    keyToCoords(key) {
        if (typeof key === 'string') return key.split('|').map(Number);
        const iy = key % 1024;
        const rest = Math.floor(key / 1024);
        const iz = rest % 2097152; // 2^21
        const ix = Math.floor(rest / 2097152);
        return [ix - 1048576, iy - 512, iz - 1048576];
    }

    getChunkCoord(val) {
        return Math.floor(val / this.chunkSize);
    }

    getChunkKey(cx, cz) {
        return `${cx}|${cz}`;
    }

    pointToBlockCoord(x, y, z) {
        return {
            x: Math.round(x),
            y: Math.round(y),
            z: Math.round(z)
        };
    }

    getLandmarkStorageKey(x, z) {
        // High-precision storage key for settlements/landmarks
        const ix = Math.floor(x) + 1048576;
        const iz = Math.floor(z) + 1048576;
        return `LM|${ix}|${iz}`;
    }
}
