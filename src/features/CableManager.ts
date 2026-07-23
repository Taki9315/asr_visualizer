import * as THREE from 'three';
import type { CableRouteRecord, Vec3 } from '../types';
import { MM, mmVecToM, mVecToMm } from '../core/units';

interface CableRuntime {
  record: CableRouteRecord;
  tube: THREE.Mesh;
  handleGroup: THREE.Group;
}

export interface CableHandleRef {
  cableId: string;
  index: number;
}

/**
 * Feature 15: cable routes as editable 3D paths.
 * Each route is a Catmull-Rom spline through mm control points, rendered as a
 * tube. In cable-edit mode the control points appear as draggable handles.
 */
export class CableManager {
  /** Tubes (visible when cables toggled on). */
  readonly root = new THREE.Group();
  /** Handle spheres (visible in cable-edit mode). */
  readonly handlesRoot = new THREE.Group();

  private readonly cables = new Map<string, CableRuntime>();
  private editMode = false;
  selectedHandle: CableHandleRef | null = null;
  private readonly changed: () => void;

  constructor(records: readonly CableRouteRecord[], onChanged: () => void) {
    this.root.name = 'cables-root';
    this.root.visible = false;
    this.handlesRoot.name = 'cable-handles-root';
    this.handlesRoot.visible = false;
    this.changed = onChanged;
    this.setRoutes(records);
  }

  list(): readonly CableRouteRecord[] {
    return [...this.cables.values()].map((c) => c.record);
  }

  get(cableId: string): CableRouteRecord | undefined {
    return this.cables.get(cableId)?.record;
  }

  private buildCurve(record: CableRouteRecord): THREE.CatmullRomCurve3 {
    return new THREE.CatmullRomCurve3(
      record.pointsMm.map((p) => mmVecToM(p)),
      false,
      'centripetal'
    );
  }

  private buildTubeGeometry(record: CableRouteRecord): THREE.TubeGeometry {
    const curve = this.buildCurve(record);
    const segments = Math.max(24, record.pointsMm.length * 12);
    return new THREE.TubeGeometry(curve, segments, (record.diameterMm / 2) * MM, 10, false);
  }

  private addCable(record: CableRouteRecord): void {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(record.colorHex),
      roughness: 0.6,
      metalness: 0.05
    });
    const tube = new THREE.Mesh(this.buildTubeGeometry(record), material);
    tube.name = `cable:${record.id}`;
    tube.userData['cableId'] = record.id;
    tube.userData['pickIgnore'] = true;
    this.root.add(tube);

    const handleGroup = new THREE.Group();
    handleGroup.name = `cable-handles:${record.id}`;
    this.handlesRoot.add(handleGroup);

    const runtime: CableRuntime = { record, tube, handleGroup };
    this.cables.set(record.id, runtime);
    this.rebuildHandles(runtime);
  }

  private rebuildHandles(rt: CableRuntime): void {
    for (const child of [...rt.handleGroup.children]) {
      rt.handleGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    rt.record.pointsMm.forEach((p, index) => {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(0.009, 14, 10),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(rt.record.colorHex),
          depthTest: false,
          transparent: true,
          opacity: 0.9
        })
      );
      handle.renderOrder = 21;
      handle.position.copy(mmVecToM(p));
      handle.userData['cableHandle'] = true;
      handle.userData['cableId'] = rt.record.id;
      handle.userData['pointIndex'] = index;
      rt.handleGroup.add(handle);
    });
  }

  private rebuildTube(rt: CableRuntime): void {
    rt.tube.geometry.dispose();
    rt.tube.geometry = this.buildTubeGeometry(rt.record);
  }

  setEditMode(on: boolean): void {
    this.editMode = on;
    this.handlesRoot.visible = on;
    if (!on) this.setSelectedHandle(null);
  }

  isEditMode(): boolean {
    return this.editMode;
  }

  getHandleMeshes(): THREE.Object3D[] {
    return [...this.cables.values()].map((c) => c.handleGroup);
  }

  getHandleMesh(ref: CableHandleRef): THREE.Mesh | null {
    const rt = this.cables.get(ref.cableId);
    if (!rt) return null;
    const child = rt.handleGroup.children[ref.index];
    return child instanceof THREE.Mesh ? child : null;
  }

  setSelectedHandle(ref: CableHandleRef | null): void {
    if (this.selectedHandle) {
      const prev = this.getHandleMesh(this.selectedHandle);
      if (prev) (prev.material as THREE.MeshBasicMaterial).color.set(
        new THREE.Color(this.cables.get(this.selectedHandle.cableId)?.record.colorHex ?? '#ffffff')
      );
    }
    this.selectedHandle = ref;
    if (ref) {
      const mesh = this.getHandleMesh(ref);
      if (mesh) (mesh.material as THREE.MeshBasicMaterial).color.set(0xffffff);
    }
    this.changed();
  }

  /** Called while a handle is dragged: writes position back and rebuilds the tube. */
  onHandleMoved(ref: CableHandleRef): void {
    const rt = this.cables.get(ref.cableId);
    if (!rt) return;
    const mesh = this.getHandleMesh(ref);
    if (!mesh) return;
    const mm = mVecToMm(mesh.position);
    const pts = rt.record.pointsMm;
    if (ref.index >= 0 && ref.index < pts.length) {
      pts[ref.index] = mm;
      this.rebuildTube(rt);
    }
  }

  /** Inserts a point after the selected one (midpoint to the next / extrapolated at the end). */
  insertAfterSelected(): CableHandleRef | null {
    const ref = this.selectedHandle;
    if (!ref) return null;
    const rt = this.cables.get(ref.cableId);
    if (!rt) return null;
    const pts = rt.record.pointsMm;
    const cur = pts[ref.index];
    if (!cur) return null;
    const next = pts[ref.index + 1];
    let inserted: Vec3;
    if (next) {
      inserted = [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2, (cur[2] + next[2]) / 2];
    } else {
      const prev = pts[ref.index - 1] ?? cur;
      inserted = [
        cur[0] + (cur[0] - prev[0]) * 0.5 + 20,
        cur[1] + (cur[1] - prev[1]) * 0.5,
        cur[2] + (cur[2] - prev[2]) * 0.5
      ];
    }
    pts.splice(ref.index + 1, 0, inserted);
    this.rebuildHandles(rt);
    this.rebuildTube(rt);
    const newRef: CableHandleRef = { cableId: ref.cableId, index: ref.index + 1 };
    this.setSelectedHandle(newRef);
    return newRef;
  }

  /** Deletes the selected point (a route keeps at least two points). */
  deleteSelected(): boolean {
    const ref = this.selectedHandle;
    if (!ref) return false;
    const rt = this.cables.get(ref.cableId);
    if (!rt) return false;
    const pts = rt.record.pointsMm;
    if (pts.length <= 2) return false;
    pts.splice(ref.index, 1);
    this.setSelectedHandle(null);
    this.rebuildHandles(rt);
    this.rebuildTube(rt);
    return true;
  }

  /** Deep-copies current routes (for saving). */
  serialize(): CableRouteRecord[] {
    return this.list().map((r) => ({
      ...r,
      pointsMm: r.pointsMm.map((p) => [...p] as Vec3)
    }));
  }

  /** Replaces all routes (used by config load). */
  setRoutes(records: readonly CableRouteRecord[]): void {
    this.setSelectedHandle(null);
    for (const rt of this.cables.values()) {
      this.root.remove(rt.tube);
      rt.tube.geometry.dispose();
      (rt.tube.material as THREE.Material).dispose();
      this.handlesRoot.remove(rt.handleGroup);
      for (const child of rt.handleGroup.children) {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    }
    this.cables.clear();
    for (const record of records) {
      this.addCable({ ...record, pointsMm: record.pointsMm.map((p) => [...p] as Vec3) });
    }
    this.changed();
  }
}
