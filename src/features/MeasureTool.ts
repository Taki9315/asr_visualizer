import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { MM, round1 } from '../core/units';

export interface Measurement {
  id: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  distanceMm: number;
  deltaMm: [number, number, number];
  group: THREE.Group;
}

/**
 * Feature 13: two-click distance measurement with mm readout and per-axis deltas.
 */
export class MeasureTool {
  readonly root = new THREE.Group();
  private pending: THREE.Vector3 | null = null;
  private pendingMarker: THREE.Mesh | null = null;
  private readonly measurements: Measurement[] = [];
  private nextId = 1;
  private changed: () => void;

  constructor(onChanged: () => void) {
    this.root.name = 'measurements-root';
    this.changed = onChanged;
  }

  list(): readonly Measurement[] {
    return this.measurements;
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  private makeMarker(p: THREE.Vector3, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 16, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 })
    );
    mesh.position.copy(p);
    mesh.renderOrder = 20;
    mesh.userData['pickIgnore'] = true;
    return mesh;
  }

  /** Returns 'first' after the first click, 'complete' after the second. */
  addPoint(p: THREE.Vector3): 'first' | 'complete' {
    if (!this.pending) {
      this.pending = p.clone();
      this.pendingMarker = this.makeMarker(p, 0xffd94f);
      this.root.add(this.pendingMarker);
      return 'first';
    }

    const a = this.pending;
    const b = p.clone();
    this.pending = null;
    if (this.pendingMarker) {
      this.root.remove(this.pendingMarker);
      this.pendingMarker.geometry.dispose();
      (this.pendingMarker.material as THREE.Material).dispose();
      this.pendingMarker = null;
    }

    const group = new THREE.Group();
    group.add(this.makeMarker(a, 0xffd94f));
    group.add(this.makeMarker(b, 0xffd94f));

    const lineGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xffd94f, depthTest: false, transparent: true })
    );
    line.renderOrder = 19;
    line.userData['pickIgnore'] = true;
    group.add(line);

    const distanceMm = round1(a.distanceTo(b) / MM);
    const deltaMm: [number, number, number] = [
      round1(Math.abs(b.x - a.x) / MM),
      round1(Math.abs(b.y - a.y) / MM),
      round1(Math.abs(b.z - a.z) / MM)
    ];

    const el = document.createElement('div');
    el.className = 'measure-label';
    el.textContent = `${distanceMm.toFixed(1)} mm`;
    el.title = `dX ${deltaMm[0].toFixed(1)}  dY ${deltaMm[1].toFixed(1)}  dZ ${deltaMm[2].toFixed(1)} mm`;
    const label = new CSS2DObject(el);
    label.position.copy(a.clone().add(b).multiplyScalar(0.5));
    group.add(label);

    this.root.add(group);
    this.measurements.push({ id: this.nextId, a, b, distanceMm, deltaMm, group });
    this.nextId += 1;
    this.changed();
    return 'complete';
  }

  cancelPending(): void {
    this.pending = null;
    if (this.pendingMarker) {
      this.root.remove(this.pendingMarker);
      this.pendingMarker.geometry.dispose();
      (this.pendingMarker.material as THREE.Material).dispose();
      this.pendingMarker = null;
    }
  }

  remove(id: number): void {
    const idx = this.measurements.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const m = this.measurements[idx];
    if (m) this.disposeGroup(m.group);
    this.measurements.splice(idx, 1);
    this.changed();
  }

  clearAll(): void {
    this.cancelPending();
    for (const m of this.measurements) this.disposeGroup(m.group);
    this.measurements.length = 0;
    this.changed();
  }

  private disposeGroup(group: THREE.Group): void {
    this.root.remove(group);
    group.traverse((obj) => {
      if (obj instanceof CSS2DObject) obj.element.remove();
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else mat.dispose();
      }
    });
  }
}
