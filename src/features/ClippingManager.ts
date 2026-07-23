import * as THREE from 'three';
import type { Axis } from '../types';
import { MM } from '../core/units';

interface AxisClipState {
  enabled: boolean;
  flipped: boolean;
  offsetMm: number;
  plane: THREE.Plane;
  helper: THREE.PlaneHelper;
}

const AXIS_VECTORS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

/**
 * Feature 12: section clipping along X, Y and Z.
 * Clipping planes are applied per-material (renderer.localClippingEnabled),
 * so helper geometry such as the grid and transform gizmo stays intact.
 */
export class ClippingManager {
  private readonly states: Record<Axis, AxisClipState>;
  private readonly getRoots: () => THREE.Object3D[];

  constructor(scene: THREE.Scene, getRoots: () => THREE.Object3D[]) {
    this.getRoots = getRoots;
    const make = (axis: Axis, color: number): AxisClipState => {
      const plane = new THREE.Plane(AXIS_VECTORS[axis].clone().negate(), 0);
      const helper = new THREE.PlaneHelper(plane, 1.6, color);
      helper.visible = false;
      scene.add(helper);
      return { enabled: false, flipped: false, offsetMm: 0, plane, helper };
    };
    this.states = {
      x: make('x', 0xd95757),
      y: make('y', 0x57d96a),
      z: make('z', 0x57a0d9)
    };
  }

  getState(axis: Axis): { enabled: boolean; flipped: boolean; offsetMm: number } {
    const s = this.states[axis];
    return { enabled: s.enabled, flipped: s.flipped, offsetMm: s.offsetMm };
  }

  setEnabled(axis: Axis, on: boolean): void {
    this.states[axis].enabled = on;
    this.rebuild();
  }

  setOffsetMm(axis: Axis, offsetMm: number): void {
    this.states[axis].offsetMm = offsetMm;
    this.rebuild();
  }

  flip(axis: Axis): void {
    this.states[axis].flipped = !this.states[axis].flipped;
    this.rebuild();
  }

  private activePlanes(): THREE.Plane[] {
    const out: THREE.Plane[] = [];
    for (const axis of ['x', 'y', 'z'] as const) {
      const s = this.states[axis];
      s.helper.visible = s.enabled;
      if (!s.enabled) continue;
      const offsetM = s.offsetMm * MM;
      const n = AXIS_VECTORS[axis].clone();
      if (s.flipped) {
        // keep coordinate >= offset: normal +axis, constant -offset
        s.plane.set(n, -offsetM);
      } else {
        // keep coordinate <= offset: normal -axis, constant +offset
        s.plane.set(n.negate(), offsetM);
      }
      out.push(s.plane);
    }
    return out;
  }

  /**
   * True when the point is on the kept side of every active clipping plane.
   * Used to stop raycast picks landing on clipped-away geometry.
   */
  isPointVisible(p: THREE.Vector3): boolean {
    for (const axis of ['x', 'y', 'z'] as const) {
      const s = this.states[axis];
      if (!s.enabled) continue;
      if (s.plane.distanceToPoint(p) < -1e-6) return false;
    }
    return true;
  }

  /** Re-applies clipping planes to every material under the managed roots. */
  rebuild(): void {
    const planes = this.activePlanes();
    const assign = planes.length > 0 ? planes : null;
    for (const root of this.getRoots()) {
      root.traverse((obj) => {
        const anyObj = obj as { material?: THREE.Material | THREE.Material[] };
        const mat = anyObj.material;
        if (!mat) return;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
          if (m.clippingPlanes !== assign) {
            m.clippingPlanes = assign;
            m.needsUpdate = true;
          }
        }
      });
    }
  }
}
