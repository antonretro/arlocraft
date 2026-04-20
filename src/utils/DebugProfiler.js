/**
 * DebugProfiler — ArloCraft Performance Diagnostic Tool
 * 
 * Provides real-time metrics for CPU and GPU bottlenecks.
 * Toggled with F3.
 */
export class DebugProfiler {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.fps = 0;
        this.frameTime = 0;
        this.lastTime = performance.now();
        this.frames = 0;
        this.accumulator = 0;

        this.timers = new Map();
        this.metrics = {
            drawCalls: 0,
            triangles: 0,
            geometries: 0,
            textures: 0,
            chunks: 0,
            dirtyChunks: 0,
            particles: 0,
            rebuildQueue: 0
        };

        this.container = this._createUI();
    }

    _createUI() {
        const div = document.createElement('div');
        div.id = 'ni-debug-profiler';
        div.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.75);
            color: #00FF00;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid rgba(0, 255, 0, 0.3);
            pointer-events: none;
            z-index: 1000000;
            display: none;
            backdrop-filter: blur(4px);
            min-width: 250px;
            line-height: 1.4;
        `;
        document.body.appendChild(div);
        return div;
    }

    toggle() {
        this.visible = !this.visible;
        this.container.style.display = this.visible ? 'block' : 'none';
        console.log(`[ArloCraft] Debug Profiler: ${this.visible ? 'ON' : 'OFF'}`);
    }

    begin(label) {
        this.timers.set(label, performance.now());
    }

    end(label) {
        const start = this.timers.get(label);
        if (start) {
            const duration = performance.now() - start;
            this.metrics[`${label}Ms`] = duration.toFixed(2);
        }
    }

    update(renderer) {
        if (!this.visible) return;

        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;

        this.accumulator += delta;
        this.frames++;

        if (this.accumulator >= 1000) {
            this.fps = Math.round((this.frames * 1000) / this.accumulator);
            this.frameTime = (this.accumulator / this.frames).toFixed(2);
            this.frames = 0;
            this.accumulator = 0;
            this._render(renderer);
        }
    }

    _render(renderer) {
        if (!renderer) return;

        // Fetch engine stats
        const info = renderer.info;
        this.metrics.drawCalls = info.render.calls;
        this.metrics.triangles = info.render.triangles;
        this.metrics.geometries = info.memory.geometries;
        this.metrics.textures = info.memory.textures;

        // Fetch game stats
        this.metrics.chunks = this.game.world?.chunkManager?.size || 0;
        this.metrics.dirtyChunks = this.game.world?.chunkManager?.priorityDirtyChunkKeys?.size || 0;
        this.metrics.particles = this.game.particles?.particles?.length || 0;
        this.metrics.rebuildQueue = this.game.world?.chunkManager?.pendingChunkLoads?.length || 0;

        let html = `<div style="font-weight:bold; color: #FFF; margin-bottom: 8px;">ARLOCRAFT PROFILER</div>`;
        html += `FPS: <span style="color: ${this.fps > 55 ? '#00FF00' : '#FFBB00'}">${this.fps}</span> (${this.frameTime}ms)<br/>`;
        
        html += `<div style="margin-top:8px; border-bottom: 1px solid rgba(0,255,0,0.2);">TIMINGS</div>`;
        html += `Physics: ${this.metrics.physicsMs || 0}ms<br/>`;
        html += `WorldUpdate: ${this.metrics.worldMs || 0}ms<br/>`;
        html += `RenderPass: ${this.metrics.renderMs || 0}ms<br/>`;

        html += `<div style="margin-top:8px; border-bottom: 1px solid rgba(0,255,0,0.2);">GPU STATS</div>`;
        html += `Draw Calls: ${this.metrics.drawCalls}<br/>`;
        html += `Triangles: ${this.metrics.triangles.toLocaleString()}<br/>`;
        html += `Geometries: ${this.metrics.geometries}<br/>`;
        html += `Textures: ${this.metrics.textures}<br/>`;

        html += `<div style="margin-top:8px; border-bottom: 1px solid rgba(0,255,0,0.2);">GAME STATE</div>`;
        html += `Loaded Chunks: ${this.metrics.chunks}<br/>`;
        html += `Dirty Chunks: ${this.metrics.dirtyChunks}<br/>`;
        html += `Load Queue: ${this.metrics.rebuildQueue}<br/>`;
        html += `Particles: ${this.metrics.particles}<br/>`;

        this.container.innerHTML = html;
    }
}
