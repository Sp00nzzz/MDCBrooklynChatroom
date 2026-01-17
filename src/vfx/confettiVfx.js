import * as THREE from 'three';

const STATE_AIR = 0;
const STATE_LANDED = 1;

const MIN_COUNT = 120;
const MAX_COUNT = 250;
const DEFAULT_COUNT = 180;

const GRAVITY = 6.5;
const AIR_DRAG = 0.25;
const DRIFT_ACCEL = 0.6;
const FLOOR_Y = 0.0;
const FLOOR_OFFSET = 0.008;
const LAND_FRICTION = 0.2;
const ANGULAR_DAMPING = 1.2;

const CONFETTI_SIZE_X = 0.1;
const CONFETTI_SIZE_Y = 0.18;

const PALETTE = [
  new THREE.Color(0xff00ff),
  new THREE.Color(0x00ffff),
  new THREE.Color(0xffff00),
  new THREE.Color(0xff0080),
  new THREE.Color(0x00ff80),
  new THREE.Color(0x0080ff),
  new THREE.Color(0xff8000),
  new THREE.Color(0xff4dff),
  new THREE.Color(0x00ff00),
  new THREE.Color(0xff0000),
  new THREE.Color(0x00ffea),
  new THREE.Color(0xffe600),
  new THREE.Color(0xff6a00),
  new THREE.Color(0x3dff00)
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class ConfettiSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.destroyed = false;
    this.count = 0;
    this.capacity = MAX_COUNT;
    this.elapsed = 0;
    this.lifetimeAfterLand = 5;

    this.geometry = new THREE.PlaneGeometry(CONFETTI_SIZE_X, CONFETTI_SIZE_Y);
    const vertexCount = this.geometry.attributes.position.count;
    const baseColors = new Float32Array(vertexCount * 3);
    for (let i = 0; i < baseColors.length; i += 3) {
      baseColors[i] = 1;
      baseColors[i + 1] = 1;
      baseColors[i + 2] = 1;
    }
    this.geometry.setAttribute('color', new THREE.BufferAttribute(baseColors, 3));
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      vertexColors: true
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    this.positions = null;
    this.velocities = null;
    this.rotations = null;
    this.angularVelocity = null;
    this.drift = null;
    this.colors = null;
    this.states = null;
    this.landTimes = null;

    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._pos = new THREE.Vector3();
    this._euler = new THREE.Euler();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._loggedUpdate = false;
  }

  spawn(origin, options = {}) {
    if (this.destroyed) return;

    const count = clamp(options.count ?? DEFAULT_COUNT, MIN_COUNT, MAX_COUNT);
    this.lifetimeAfterLand = options.lifetimeAfterLand ?? 5;
    this.count = count;
    this.elapsed = 0;
    this._loggedUpdate = false;

    const total = count * 3;
    if (!this.positions || this.positions.length !== total) {
      this.positions = new Float32Array(total);
      this.velocities = new Float32Array(total);
      this.rotations = new Float32Array(total);
      this.angularVelocity = new Float32Array(total);
      this.colors = new Float32Array(total);
    }
    if (!this.drift || this.drift.length !== count * 2) {
      this.drift = new Float32Array(count * 2);
    }
    if (!this.states || this.states.length !== count) {
      this.states = new Uint8Array(count);
      this.landTimes = new Float32Array(count);
    }

    const forward = new THREE.Vector3();
    const up = this.camera.up.clone().normalize();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(forward).normalize();
    right.crossVectors(forward, up).normalize();

    const spawnRadius = 0.9;
    const spawnHeight = 0.5;
    const forwardBias = 0.6;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const rightOffset = (Math.random() - 0.5) * spawnRadius * 2;
      const height = (Math.random() - 0.5) * spawnHeight;
      const forwardOffset = (Math.random() - 0.35) * spawnRadius + Math.random() * forwardBias;

      const offsetX = right.x * rightOffset + forward.x * forwardOffset + up.x * height;
      const offsetY = right.y * rightOffset + forward.y * forwardOffset + up.y * height;
      const offsetZ = right.z * rightOffset + forward.z * forwardOffset + up.z * height;

      this.positions[idx] = origin.x + offsetX;
      this.positions[idx + 1] = origin.y + offsetY;
      this.positions[idx + 2] = origin.z + offsetZ;

      const lateral = (Math.random() - 0.5) * 1.6;
      const forwardSpeed = 0.8 + Math.random() * 1.2;
      const upSpeed = 1.4 + Math.random() * 1.2;

      this.velocities[idx] = right.x * lateral + forward.x * forwardSpeed + up.x * upSpeed;
      this.velocities[idx + 1] = right.y * lateral + forward.y * forwardSpeed + up.y * upSpeed;
      this.velocities[idx + 2] = right.z * lateral + forward.z * forwardSpeed + up.z * upSpeed;

      this.rotations[idx] = Math.random() * Math.PI * 2;
      this.rotations[idx + 1] = Math.random() * Math.PI * 2;
      this.rotations[idx + 2] = Math.random() * Math.PI * 2;

      this.angularVelocity[idx] = (Math.random() - 0.5) * 6;
      this.angularVelocity[idx + 1] = (Math.random() - 0.5) * 6;
      this.angularVelocity[idx + 2] = (Math.random() - 0.5) * 6;

      this.drift[i * 2] = (Math.random() - 0.5) * DRIFT_ACCEL;
      this.drift[i * 2 + 1] = (Math.random() - 0.5) * DRIFT_ACCEL;

      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      this.colors[idx] = color.r;
      this.colors[idx + 1] = color.g;
      this.colors[idx + 2] = color.b;

      this.states[i] = STATE_AIR;
      this.landTimes[i] = -1;
    }

    const colorArray = this.mesh.instanceColor.array;
    for (let i = 0; i < count; i++) {
      const src = i * 3;
      colorArray[src] = this.colors[src];
      colorArray[src + 1] = this.colors[src + 1];
      colorArray[src + 2] = this.colors[src + 2];
    }

    this.mesh.count = count;
    this.mesh.visible = true;
    this.mesh.instanceColor.needsUpdate = true;
    console.log('[CONFETTI] spawn', { count });
  }

  update(dt) {
    if (this.destroyed || !this.mesh || this.count === 0) {
      return !this.destroyed;
    }

    this.elapsed += dt;

    if (!this._loggedUpdate) {
      console.log('[CONFETTI] update');
      this._loggedUpdate = true;
    }

    const positions = this.positions;
    const velocities = this.velocities;
    const rotations = this.rotations;
    const angularVelocity = this.angularVelocity;
    const drift = this.drift;
    const states = this.states;
    const landTimes = this.landTimes;
    const colors = this.colors;
    const colorArray = this.mesh.instanceColor.array;
    const count = this.count;

    let alive = 0;
    for (let i = 0; i < count; i++) {
      if (states[i] === STATE_LANDED && this.elapsed - landTimes[i] >= this.lifetimeAfterLand) {
        continue;
      }

      const idx = i * 3;
      let px = positions[idx];
      let py = positions[idx + 1];
      let pz = positions[idx + 2];
      let vx = velocities[idx];
      let vy = velocities[idx + 1];
      let vz = velocities[idx + 2];
      let rx = rotations[idx];
      let ry = rotations[idx + 1];
      let rz = rotations[idx + 2];
      let ax = angularVelocity[idx];
      let ay = angularVelocity[idx + 1];
      let az = angularVelocity[idx + 2];

      if (states[i] === STATE_AIR) {
        vy -= GRAVITY * dt;
        vx += drift[i * 2] * dt;
        vz += drift[i * 2 + 1] * dt;
        const drag = Math.max(0, 1 - AIR_DRAG * dt);
        vx *= drag;
        vy *= drag;
        vz *= drag;

        px += vx * dt;
        py += vy * dt;
        pz += vz * dt;

        if (py <= FLOOR_Y) {
          py = FLOOR_Y + FLOOR_OFFSET;
          vy = 0;
          vx *= LAND_FRICTION;
          vz *= LAND_FRICTION;
          states[i] = STATE_LANDED;
          landTimes[i] = this.elapsed;
        }

        rx += ax * dt;
        ry += ay * dt;
        rz += az * dt;
      } else {
        const damping = Math.max(0, 1 - ANGULAR_DAMPING * dt);
        ax *= damping;
        ay *= damping;
        az *= damping;
        rx += ax * dt;
        ry += ay * dt;
        rz += az * dt;
        py = FLOOR_Y + FLOOR_OFFSET;
        vx = 0;
        vy = 0;
        vz = 0;
      }

      positions[idx] = px;
      positions[idx + 1] = py;
      positions[idx + 2] = pz;
      velocities[idx] = vx;
      velocities[idx + 1] = vy;
      velocities[idx + 2] = vz;
      rotations[idx] = rx;
      rotations[idx + 1] = ry;
      rotations[idx + 2] = rz;
      angularVelocity[idx] = ax;
      angularVelocity[idx + 1] = ay;
      angularVelocity[idx + 2] = az;

      this._pos.set(px, py, pz);
      this._euler.set(rx, ry, rz);
      this._quat.setFromEuler(this._euler);
      this._matrix.compose(this._pos, this._quat, this._scale);
      this.mesh.setMatrixAt(alive, this._matrix);

      const src = idx;
      const dst = alive * 3;
      colorArray[dst] = colors[src];
      colorArray[dst + 1] = colors[src + 1];
      colorArray[dst + 2] = colors[src + 2];

      alive += 1;
    }

    this.mesh.count = alive;
    if (alive > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      return true;
    }

    this.destroy();
    return false;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    console.log('[CONFETTI] destroy');

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }

    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }

    if (this.material) {
      this.material.dispose();
      this.material = null;
    }

    this.positions = null;
    this.velocities = null;
    this.rotations = null;
    this.angularVelocity = null;
    this.drift = null;
    this.colors = null;
    this.states = null;
    this.landTimes = null;
    this.scene = null;
    this.camera = null;
    this.count = 0;
  }
}
