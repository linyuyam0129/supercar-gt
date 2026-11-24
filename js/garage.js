// 車庫展示間：深色攝影棚、反光地板、轉盤、柔光燈箱；可拖曳旋轉觀看車輛
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARS, PAINTS } from './data.js';
import { Profile } from './store.js';
import { buildCar } from './carModel.js';

export class Garage {
  constructor(renderer, camera, quality) {
    this.renderer = renderer;
    this.camera = camera;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0e);
    scene.fog = new THREE.Fog(0x0a0b0e, 14, 40);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();
    scene.environment = this.env;
    scene.environmentIntensity = 0.55;

    // 地板與轉盤
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.22, metalness: 0.4 }));
    floor.receiveShadow = true;
    scene.add(floor);
    this.turntable = new THREE.Group();
    scene.add(this.turntable);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.08, 72),
      new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.3, metalness: 0.6 }));
    disc.position.y = 0.04; disc.receiveShadow = true;
    this.turntable.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.66, 0.025, 8, 120).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3b2a, emissiveIntensity: 2.2 }));
    ring.position.y = 0.08;
    scene.add(ring);

    // 燈箱（發光平面）
    const soft = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [x, z, ry] of [[0, -6, 0], [-7, 1, Math.PI / 2.4], [7, 1, -Math.PI / 2.4]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), soft);
      p.position.set(x, 4.6, z); p.rotation.set(Math.PI / 2.6, ry, 0, 'YXZ');
      scene.add(p);
    }
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.25), soft);
    strip.position.set(0, 6, 0); strip.rotation.x = Math.PI / 2;
    scene.add(strip);

    // 燈光
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x101012, 0.35));
    const key = new THREE.SpotLight(0xffffff, 110, 30, Math.PI / 5, 0.6, 1.6);
    key.position.set(4, 8, 5); key.castShadow = quality !== 'low';
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
    scene.add(key, key.target);
    const rim = new THREE.SpotLight(0xffd9c2, 80, 30, Math.PI / 5, 0.7, 1.6);
    rim.position.set(-5, 6, -6);
    scene.add(rim, rim.target);
    const fill = new THREE.SpotLight(0xc8d6ff, 40, 30, Math.PI / 4, 0.8, 1.6);
    fill.position.set(-6, 5, 6);
    scene.add(fill, fill.target);

    this.index = Math.max(0, CARS.findIndex((c) => c.id === Profile.selected));
    this.angle = -0.6;
    this.autoSpin = true;
    this.dragVel = 0;
    this.camYaw = 0.7;
    this.time = 0;
    this.quality = quality;
    this.models = new Map();
    this.show(this.index);
    this.bindDrag();
  }

  get car() { return CARS[this.index]; }

  show(i) {
    this.index = (i + CARS.length) % CARS.length;
    if (this.current) this.turntable.remove(this.current.root);
    const spec = this.car;
    let m = this.models.get(spec.id);
    if (!m) { m = buildCar(spec, PAINTS[Profile.paintOf(spec)], { shadows: this.quality !== 'low' }); this.models.set(spec.id, m); }
    m.root.position.set(0, 0.08, 0);
    m.setPaint(PAINTS[Profile.paintOf(spec)]);
    this.turntable.add(m.root);
    this.current = m;
  }
  setPaint(i) { Profile.setPaint(this.car, i); this.current.setPaint(PAINTS[i]); }

  bindDrag() {
    const el = this.renderer.domElement;
    let last = null;
    this.onDown = (e) => { last = e.clientX; this.autoSpin = false; this.dragVel = 0; };
    this.onMove = (e) => {
      if (last === null) return;
      const d = (e.clientX - last) * 0.008;
      last = e.clientX;
      this.angle += d; this.dragVel = d;
    };
    this.onUp = () => { last = null; clearTimeout(this.resumeT); this.resumeT = setTimeout(() => { this.autoSpin = true; }, 3500); };
    el.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
  }

  update(dt, lookX) {
    this.time += dt;
    if (Math.abs(lookX) > 0.1) { this.angle += lookX * dt * 2; this.autoSpin = false; clearTimeout(this.resumeT); this.resumeT = setTimeout(() => { this.autoSpin = true; }, 3500); }
    if (this.autoSpin) this.angle += dt * 0.25;
    else { this.angle += this.dragVel; this.dragVel *= 0.9; }
    this.turntable.rotation.y = this.angle;

    const cam = this.camera;
    const aspect = cam.aspect;
    const dist = 8.4 * Math.max(1, 1.75 / aspect);
    const yaw = this.camYaw + Math.sin(this.time * 0.15) * 0.05;
    cam.position.set(Math.sin(yaw) * dist, 2.1, Math.cos(yaw) * dist);
    cam.fov = 30;
    cam.near = 0.1; cam.far = 100;
    cam.lookAt(0, 0.55, 0);
    // 車子偏右顯示，讓左側資訊面板不擋住
    const w = innerWidth, h = innerHeight;
    cam.setViewOffset(w, h, -w * (aspect > 1.3 ? 0.14 : 0), -h * 0.04, w, h);
    cam.updateProjectionMatrix();
    this.renderer.render(this.scene, cam);
  }

  dispose() {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    this.camera.clearViewOffset();
    for (const m of this.models.values()) m.dispose();
    this.env.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
  }
}
