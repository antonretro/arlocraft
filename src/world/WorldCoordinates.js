export class WorldCoordinates {
    constructor(config) {
        this.chunkSize = config.chunkSize;
    }

    getKey(x, y, z) {
        return `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
    }

    keyToCoords(key) {
        if (typeof key === 'number') {
            const y = (key % 2048) - 512;
            const remaining = Math.floor(key / 2048);
            const z = (remaining % 2097152) - 1000000;
            const x = Math.floor(remaining / 2097152) - 1000000;
            return [x, y, z];
        }
        return String(key).split('|').map(Number);
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
}
