/**
 * Port of Java's Random and Minecraft's NoiseGeneratorOctaves
 * to ensure deterministic Beta 1.7.3-style terrain.
 */

export class JavaRandom {
    constructor(seed = 0n) {
        if (typeof seed === 'number') seed = BigInt(seed);
        this.seed = (seed ^ 0x5DEECE66Dn) & ((1n << 48n) - 1n);
    }

    setSeed(seed) {
        if (typeof seed === 'number') seed = BigInt(seed);
        this.seed = (seed ^ 0x5DEECE66Dn) & ((1n << 48n) - 1n);
    }

    next(bits) {
        this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & ((1n << 48n) - 1n);
        return Number(this.seed >> (48n - BigInt(bits)));
    }

    nextInt(bound) {
        if (bound <= 0) return 0;
        if ((bound & -bound) === bound) {
            return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
        }
        let bits, val;
        do {
            bits = this.next(31);
            val = bits % bound;
        } while (bits - val + (bound - 1) < 0);
        return val;
    }

    nextDouble() {
        const high = BigInt(this.next(26)) << 27n;
        const low = BigInt(this.next(27));
        return Number(high + low) / (1 << 53);
    }
}

export class PerlinNoise {
    constructor(random) {
        this.p = new Uint8Array(512);
        this.offsetX = random.nextDouble() * 256;
        this.offsetY = random.nextDouble() * 256;
        this.offsetZ = random.nextDouble() * 256;

        for (let i = 0; i < 256; i++) this.p[i] = i;
        for (let i = 0; i < 256; i++) {
            const j = random.nextInt(256 - i) + i;
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
            this.p[i + 256] = this.p[i];
        }
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y, z) {
        x += this.offsetX;
        y += this.offsetY;
        z += this.offsetZ;

        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.p[X] + Y, AA = this.p[A] + Z, AB = this.p[A + 1] + Z;
        const B = this.p[X + 1] + Y, BA = this.p[B] + Z, BB = this.p[B + 1] + Z;

        return this.lerp(w,
            this.lerp(v,
                this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z)),
                this.lerp(u, this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z))
            ),
            this.lerp(v,
                this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))
            )
        );
    }
}

export class OctavePerlin {
    constructor(random, octaves) {
        this.generators = [];
        for (let i = 0; i < octaves; i++) {
            this.generators.push(new PerlinNoise(random));
        }
    }

    noise(x, y, z, xScale = 1, yScale = 1, zScale = 1) {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;

        for (const gen of this.generators) {
            total += gen.noise(x * frequency * xScale, y * frequency * yScale, z * frequency * zScale) * amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        return total;
    }
}
