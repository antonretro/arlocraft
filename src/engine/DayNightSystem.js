import * as THREE from 'three';

export class DayNightSystem {
    constructor(renderer, world, features) {
        this.renderer = renderer;
        this.world = world;
        this.features = features;
        this.timeOfDay = 0.3;
        this.dayDurationSeconds = 420;
    }

    update(delta, getPlayerPosition) {
        this.timeOfDay = (this.timeOfDay + (delta / this.dayDurationSeconds)) % 1;
        const angle = (this.timeOfDay * Math.PI * 2) - (Math.PI / 2);
        const sunHeight = Math.sin(angle);
        const sunDistance = 110;

        this.renderer.sun.position.set(
            Math.cos(angle) * sunDistance,
            sunHeight * sunDistance,
            70
        );

        const daylight = Math.max(0.08, Math.min(1, (sunHeight + 0.3)));
        this.renderer.setDaylightLevel(daylight);

        if (this.features.dynamicLighting) {
            const pos = getPlayerPosition?.();
            let depthBlend = 0;
            if (pos) {
                const surfaceY = this.world.getColumnHeight(pos.x, pos.z);
                const relativeDepth = surfaceY - pos.y;
                depthBlend = Math.max(0, Math.min(1, relativeDepth / 16));
            }
            this.renderer.updateEnvironmentLighting(daylight, pos, depthBlend);
        }
    }
}
