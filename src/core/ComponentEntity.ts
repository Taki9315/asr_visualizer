import * as THREE from 'three';
import type { ComponentRecord, KeepOutVolume, Vec3 } from '../types';
import {
  KEEPOUT_COLORS,
  KEEPOUT_VIOLATION_COLOR,
  buildComponentModel,
  buildKeepOutGroup,
  disposeObjectTree
} from './ComponentFactory';
import { MM, degVecToEuler, eulerToDegVec, mmVecToM, mVecToMm } from './units';

const SELECT_EMISSIVE = new THREE.Color(0x1e5fd6);
const COLLIDE_EMISSIVE = new THREE.Color(0xd61e1e);
const SELECT_TINT = new THREE.Color(0x4f9fd9);
const COLLIDE_TINT = new THREE.Color(0xff2a2a);

interface EmissiveMaterial extends THREE.Material {
  emissive: THREE.Color;
  emissiveIntensity: number;
}

function hasEmissive(mat: THREE.Material): mat is EmissiveMaterial {
  return 'emissive' in mat;
}

interface ColoredMaterial extends THREE.Material {
  color: THREE.Color;
}

function hasColor(mat: THREE.Material): mat is ColoredMaterial {
  return 'color' in mat;
}

/**
 * Pristine material state captured at (re)build time so highlights and the
 * transparent enclosure mode can be removed without destroying authored
 * values (GLB emissive maps, alpha-blended materials, …).
 */
interface MaterialSnapshot {
  emissive: THREE.Color | null;
  emissiveIntensity: number;
  color: THREE.Color | null;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}

/**
 * Runtime wrapper around a ComponentRecord: owns the scene objects, the base
 * (non-exploded) pose, bounding boxes and highlight state.
 */
export class ComponentEntity {
  readonly record: ComponentRecord;
  /** Scene node carrying the world placement plus any explode offset. */
  readonly root: THREE.Group;
  /** Holds either the parametric primitives or an imported GLB. */
  readonly modelHolder: THREE.Group;
  readonly keepOutGroup: THREE.Group;

  basePositionMm: Vec3;
  baseRotationDeg: Vec3;
  readonly explodeOffsetM = new THREE.Vector3();

  userVisible = true;
  hiddenByEnclosureMode = false;
  usingGlb = false;
  selected = false;
  colliding = false;

  /** AABB of the model in component-local space. */
  private readonly localAabb = new THREE.Box3();
  /** Per-mesh AABBs in component-local space (for part-level keep-out checks). */
  private localPartBoxes: THREE.Box3[] = [];
  /** World AABB at the base (non-exploded) pose. Used for collision checks. */
  readonly baseAabb = new THREE.Box3();

  private materials: THREE.Material[] = [];
  private readonly snapshots = new Map<THREE.Material, MaterialSnapshot>();
  private modelMeshes: THREE.Mesh[] = [];
  private transparentMode = false;

  constructor(record: ComponentRecord) {
    this.record = record;
    this.basePositionMm = [...record.placement.positionMm];
    this.baseRotationDeg = [...record.placement.rotationDeg];

    this.root = new THREE.Group();
    this.root.name = record.id;
    this.root.userData['componentId'] = record.id;

    this.modelHolder = new THREE.Group();
    this.modelHolder.name = `${record.id}:holder`;
    this.modelHolder.add(buildComponentModel(record));
    this.root.add(this.modelHolder);

    this.keepOutGroup = buildKeepOutGroup(record);
    this.keepOutGroup.visible = false;
    this.root.add(this.keepOutGroup);

    this.collectMaterials();
    this.syncObjectTransform();
    this.refreshLocalAabb();
    this.updateBaseAabb();
  }

  get id(): string {
    return this.record.id;
  }

  effectiveVisible(): boolean {
    return this.userVisible && !this.hiddenByEnclosureMode;
  }

  applyVisibility(): void {
    this.root.visible = this.effectiveVisible();
  }

  getBaseMatrix(): THREE.Matrix4 {
    const q = new THREE.Quaternion().setFromEuler(degVecToEuler(this.baseRotationDeg));
    return new THREE.Matrix4().compose(mmVecToM(this.basePositionMm), q, new THREE.Vector3(1, 1, 1));
  }

  /** Pushes basePositionMm/baseRotationDeg (+ explode offset) onto the scene node. */
  syncObjectTransform(): void {
    this.root.position.copy(mmVecToM(this.basePositionMm)).add(this.explodeOffsetM);
    this.root.rotation.copy(degVecToEuler(this.baseRotationDeg));
    this.root.updateMatrixWorld(true);
  }

  /** Reads the scene node back into the base pose (used after gizmo edits). */
  setPlacementFromObject(): void {
    const p = this.root.position.clone().sub(this.explodeOffsetM);
    this.basePositionMm = mVecToMm(p);
    this.baseRotationDeg = eulerToDegVec(this.root.rotation);
    this.updateBaseAabb();
  }

  /** Recomputes the component-local AABB from mesh geometry (exact, no rotation inflation). */
  refreshLocalAabb(): void {
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const parts: THREE.Box3[] = [];
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.matrixWorld.clone().invert();
    const rel = new THREE.Matrix4();
    this.modelHolder.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const geom = obj.geometry;
        if (!geom.boundingBox) geom.computeBoundingBox();
        if (geom.boundingBox) {
          tmp.copy(geom.boundingBox);
          rel.multiplyMatrices(rootInv, obj.matrixWorld);
          tmp.applyMatrix4(rel);
          box.union(tmp);
          parts.push(tmp.clone());
        }
      }
    });
    this.localAabb.copy(box);
    this.localPartBoxes = parts;
  }

  /**
   * Per-primitive world AABBs at the base pose. Multi-part components (e.g.
   * the chassis frame or PTZ + mast) are checked part-by-part so keep-out
   * intrusion tests do not flag the empty space inside their union box.
   */
  getBasePartBoxes(): THREE.Box3[] {
    const m = this.getBaseMatrix();
    return this.localPartBoxes.map((b) => b.clone().applyMatrix4(m));
  }

  updateBaseAabb(): void {
    if (this.localAabb.isEmpty()) {
      this.baseAabb.makeEmpty();
      return;
    }
    this.baseAabb.copy(this.localAabb).applyMatrix4(this.getBaseMatrix());
  }

  /** World-space AABB of one keep-out volume at the base pose. */
  getKeepOutWorldBox(ko: KeepOutVolume): THREE.Box3 {
    const half = new THREE.Vector3(
      (ko.sizeMm[0] / 2) * MM,
      (ko.sizeMm[1] / 2) * MM,
      (ko.sizeMm[2] / 2) * MM
    );
    const center = mmVecToM(ko.offsetMm);
    const box = new THREE.Box3(center.clone().sub(half), center.clone().add(half));
    return box.applyMatrix4(this.getBaseMatrix());
  }

  /** Geometric centre of the model at base pose (used for COM and explode radial). */
  getBaseCenterWorld(): THREE.Vector3 {
    const c = new THREE.Vector3();
    if (this.localAabb.isEmpty()) return mmVecToM(this.basePositionMm);
    this.localAabb.getCenter(c);
    return c.applyMatrix4(this.getBaseMatrix());
  }

  getLocalSizeMm(): Vec3 {
    const s = new THREE.Vector3();
    this.localAabb.getSize(s);
    return mVecToMm(s);
  }

  collectMaterials(): void {
    this.materials = [];
    this.modelMeshes = [];
    this.snapshots.clear();
    this.modelHolder.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        this.modelMeshes.push(obj);
        const mat = obj.material;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
          this.materials.push(m);
          this.snapshots.set(m, {
            emissive: hasEmissive(m) ? m.emissive.clone() : null,
            emissiveIntensity: hasEmissive(m) ? m.emissiveIntensity : 1,
            color: hasColor(m) ? m.color.clone() : null,
            transparent: m.transparent,
            opacity: m.opacity,
            depthWrite: m.depthWrite
          });
        }
      }
    });
  }

  getMaterials(): readonly THREE.Material[] {
    return this.materials;
  }

  /**
   * Transparent enclosure mode: fades the model and removes it from picking so
   * the internals it exposes stay selectable/measurable.
   */
  setTransparentMode(on: boolean): void {
    this.transparentMode = on;
    for (const mat of this.materials) {
      const snap = this.snapshots.get(mat);
      if (on) {
        mat.transparent = true;
        mat.opacity = 0.2;
        mat.depthWrite = false;
      } else if (snap) {
        mat.transparent = snap.transparent;
        mat.opacity = snap.opacity;
        mat.depthWrite = snap.depthWrite;
      } else {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
      mat.needsUpdate = true;
    }
    for (const mesh of this.modelMeshes) {
      mesh.userData['pickIgnore'] = on ? true : undefined;
    }
  }

  isTransparentMode(): boolean {
    return this.transparentMode;
  }

  refreshHighlight(): void {
    for (const mat of this.materials) {
      const snap = this.snapshots.get(mat);
      if (hasEmissive(mat)) {
        if (this.colliding) {
          mat.emissive.copy(COLLIDE_EMISSIVE);
          mat.emissiveIntensity = 0.85;
        } else if (this.selected) {
          mat.emissive.copy(SELECT_EMISSIVE);
          mat.emissiveIntensity = 0.55;
        } else if (snap?.emissive) {
          mat.emissive.copy(snap.emissive);
          mat.emissiveIntensity = snap.emissiveIntensity;
        } else {
          mat.emissive.setRGB(0, 0, 0);
          mat.emissiveIntensity = 1;
        }
      } else if (hasColor(mat) && snap?.color) {
        // Unlit materials (e.g. KHR_materials_unlit GLBs) have no emissive —
        // tint the base colour instead so collision/selection stays visible.
        if (this.colliding) {
          mat.color.copy(snap.color).lerp(COLLIDE_TINT, 0.65);
        } else if (this.selected) {
          mat.color.copy(snap.color).lerp(SELECT_TINT, 0.55);
        } else {
          mat.color.copy(snap.color);
        }
      }
    }
  }

  /** Tints violated keep-out volumes; pass the set of violated keep-out ids. */
  setKeepOutViolations(violated: ReadonlySet<string>): void {
    for (const child of this.keepOutGroup.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const koId = child.userData['keepOutId'] as string | undefined;
      if (koId === undefined) continue;
      const ko = this.record.keepOuts.find((k) => k.id === koId);
      if (!ko) continue;
      const isViolated = violated.has(koId);
      const color = isViolated ? KEEPOUT_VIOLATION_COLOR : KEEPOUT_COLORS[ko.kind];
      const mat = child.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = isViolated ? 0.32 : 0.12;
      const edges = child.children[0];
      if (edges instanceof THREE.LineSegments) {
        (edges.material as THREE.LineBasicMaterial).color.setHex(color);
      }
    }
  }

  /** Replaces the model content (primitives <-> GLB) and refreshes caches. */
  replaceModel(newContent: THREE.Object3D, usingGlb: boolean): void {
    for (const child of [...this.modelHolder.children]) {
      this.modelHolder.remove(child);
      disposeObjectTree(child);
    }
    this.modelHolder.add(newContent);
    this.usingGlb = usingGlb;
    this.collectMaterials();
    if (this.transparentMode) this.setTransparentMode(true);
    this.syncObjectTransform();
    this.refreshLocalAabb();
    this.updateBaseAabb();
    this.refreshHighlight();
  }

  /** Rebuilds the parametric representation (styled or primitives per HD mode). */
  rebuildPrimitives(): void {
    this.replaceModel(buildComponentModel(this.record), false);
  }
}
