import * as THREE from 'three';
import type { ComponentRecord } from '../types';
import { ComponentEntity } from './ComponentEntity';

/** Owns all component entities and the scene subtree that contains them. */
export class ComponentRegistry {
  readonly entities: ComponentEntity[] = [];
  readonly byId = new Map<string, ComponentEntity>();
  /** Scene root for all component nodes (also the raycast target for picking). */
  readonly root = new THREE.Group();

  constructor(records: readonly ComponentRecord[]) {
    this.root.name = 'components-root';
    for (const record of records) {
      const entity = new ComponentEntity(record);
      this.entities.push(entity);
      this.byId.set(record.id, entity);
      this.root.add(entity.root);
    }
  }

  get(id: string): ComponentEntity | undefined {
    return this.byId.get(id);
  }

  /** Union of base-pose AABBs — the assembly envelope used for camera framing. */
  overallBaseBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const e of this.entities) {
      if (!e.baseAabb.isEmpty()) box.union(e.baseAabb);
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, 0.5, 0.8));
    }
    return box;
  }

  /** Centroid of component centres — the origin for radial explosion. */
  assemblyCentroid(): THREE.Vector3 {
    const c = new THREE.Vector3();
    let n = 0;
    for (const e of this.entities) {
      c.add(e.getBaseCenterWorld());
      n += 1;
    }
    if (n > 0) c.divideScalar(n);
    return c;
  }

  /** Logical hierarchy (parentId) children, in dataset order. */
  childrenOf(parentId: string | null): ComponentEntity[] {
    return this.entities.filter((e) => e.record.parentId === parentId);
  }

  setKeepOutsVisible(on: boolean): void {
    for (const e of this.entities) e.keepOutGroup.visible = on;
  }
}
