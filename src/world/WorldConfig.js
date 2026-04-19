export class WorldConfig {
    constructor() {
        this.chunkSize = 12;
        this.renderDistance = {
            min: 1,
            max: 6,
            default: 2,
            vertical: 2 // Number of cubes up/down to load
        };
        this.terrain = {
            minY: -64,
            maxY: 65,
            deepMinY: -220,
            seaLevel: 1
        };
        this.influence = {
            virusRadius: 3
        };
        this.cache = {
            terrainMaxEntries: 120000,
            biomeMaxEntries: 120000
        };
    }
}
