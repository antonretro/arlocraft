import * as THREE from 'three';

export class Camera {
  constructor(scene) {
    this.instance = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      240
    );
    this.instance.position.set(0, 5, 0);
    this.instance.rotation.order = 'YXZ'; // FPS style
    this.eyeHeight = 1.32;

    // Bobbing & Shake Storage
    this.bobOffset = new THREE.Vector3();
    this.shakeOffset = new THREE.Vector3();
    this.screenShake = 0;
    this.shakeFrequency = 12;
    this.shakeDecay = 4.2;

    this.viewmodelGroup = new THREE.Group();
    this.instance.add(this.viewmodelGroup);

    scene.add(this.instance);
  }

  shake(intensity, duration = 0.5, frequency = 12) {
    this.screenShake = Math.max(this.screenShake, intensity);
    this.shakeDecay = intensity / duration;
    this.shakeFrequency = frequency;
  }

  update(delta, position, rotation, bobCycle, moveSpeed, isSprinting, settingsFov = 75, eyeHeight = this.eyeHeight) {
    // 1. FOV Lerping (Sprinting zoom)
    const targetFov = isSprinting ? settingsFov + 13 : settingsFov;
    if (Math.abs(this.instance.fov - targetFov) > 0.1) {
      this.instance.fov = THREE.MathUtils.lerp(this.instance.fov, targetFov, delta * 8);
      this.instance.updateProjectionMatrix();
    }

    // 2. Screen Shake
    if (this.screenShake > 0) {
      const time = performance.now() * 0.001;
      this.shakeOffset.x = Math.sin(time * this.shakeFrequency) * this.screenShake;
      this.shakeOffset.y = Math.cos(time * this.shakeFrequency * 1.1) * this.screenShake;
      this.screenShake = Math.max(0, this.screenShake - delta * this.shakeDecay);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    // 3. Bobbing
    const speedFactor = Math.min(1, moveSpeed / 6);
    this.bobOffset.x = Math.sin(bobCycle * 0.5) * 0.024 * speedFactor;
    this.bobOffset.y = Math.abs(Math.cos(bobCycle)) * 0.045 * speedFactor;

    // 4. Apply Transforms
    this.instance.position.set(
      position.x + this.bobOffset.x + this.shakeOffset.x,
      position.y + eyeHeight + this.bobOffset.y + this.shakeOffset.y,
      position.z
    );
    this.instance.rotation.copy(rotation);

    // 5. Viewmodel fluid lag
    this.viewmodelGroup.rotation.y = THREE.MathUtils.lerp(
      this.viewmodelGroup.rotation.y,
      (rotation.y - this.instance.rotation.y) * 0.5,
      0.1
    );
  }

  // Perspective math for 3rd person
  updateThirdPerson(delta, playerPos, yaw, pitch, distance = 4) {
    // Basic orbit camera logic
    const offset = new THREE.Vector3(0, 0, distance);
    offset.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    
    this.instance.position.copy(playerPos).add(new THREE.Vector3(0, this.eyeHeight, 0)).add(offset);
    this.instance.lookAt(playerPos.x, playerPos.y + this.eyeHeight, playerPos.z);
    
    // Apply shake here too if needed
    if (this.screenShake > 0) {
        this.instance.position.add(this.shakeOffset);
        this.screenShake = Math.max(0, this.screenShake - delta * this.shakeDecay);
    }
  }
}
