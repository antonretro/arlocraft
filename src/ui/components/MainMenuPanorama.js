import * as THREE from 'three';

/**
 * MainMenuPanorama
 * Renders a Cinematic 360-degree rotating panorama background 
 * for the title screen using a simplified voxel scene.
 */
export class MainMenuPanorama {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();
    this.isDeconstructing = false;

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1018);
    this.scene.fog = new THREE.FogExp2(0x0a1018, 0.05);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    // Add cinematic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0x00c3e3, 0.8);
    sunLight.position.set(5, 10, 5);
    this.scene.add(sunLight);

    // Create a simplified "floating world" for the background
    this.createDecorations();

    window.addEventListener('resize', this.onResize.bind(this));
    this.animate();
  }

  createDecorations() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const colors = [0x1e293b, 0x00c3e3, 0x0f172a, 0x334155];

    for (let i = 0; i < 200; i++) {
      const material = new THREE.MeshStandardMaterial({ 
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.7,
        metalness: 0.2
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      
      const dist = 10 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;
      const height = (Math.random() - 0.5) * 15;

      mesh.position.set(
        Math.cos(angle) * dist,
        height,
        Math.sin(angle) * dist
      );
      
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      const scale = 0.5 + Math.random() * 2;
      mesh.scale.set(scale, scale, scale);
      
      this.scene.add(mesh);
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    if (this.isDeconstructing) return;
    requestAnimationFrame(this.animate.bind(this));

    const time = this.clock.getElapsedTime();

    // Rotate camera in a slow, cinematic circle
    const radius = 2;
    this.camera.position.x = Math.cos(time * 0.1) * radius;
    this.camera.position.z = Math.sin(time * 0.1) * radius;
    this.camera.position.y = Math.sin(time * 0.05) * 0.5;
    this.camera.lookAt(0, 0, 0);

    // Subtle drift for objects handled by scene auto-update
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.isDeconstructing = true;
    window.removeEventListener('resize', this.onResize);
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
