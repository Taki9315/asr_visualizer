import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ComponentEntity } from '../core/ComponentEntity';
import { MM } from '../core/units';

/**
 * Feature 18: GLB import. Replaces a component's parametric primitives with a
 * mesh model (e.g. a SolidWorks/STEP export converted to GLB) while leaving
 * the component record, metadata and UI untouched. `geometry.glbUnits` on the
 * record declares the source unit convention ('mm' for typical CAD exports).
 */
export class ModelLoader {
  private readonly loader = new GLTFLoader();

  async importGlbFile(entity: ComponentEntity, file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      this.loader.parse(buffer, '', resolve, (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.install(entity, gltf.scene);
  }

  async importGlbUrl(entity: ComponentEntity, url: string): Promise<void> {
    const gltf = await this.loader.loadAsync(url);
    this.install(entity, gltf.scene);
  }

  private install(entity: ComponentEntity, content: THREE.Group): void {
    content.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.userData['componentId'] = entity.id;
        // Clone materials so highlight/transparency changes never leak between
        // components sharing a GLTF material.
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((m) => m.clone());
        } else {
          obj.material = obj.material.clone();
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.side = THREE.DoubleSide;
      }
    });

    entity.replaceModel(content, true);
    this.applyGlbConventions(entity);
  }

  /**
   * (Re)applies the record's unit and up-axis conventions to an imported GLB.
   * Called at import time and again whenever the user changes the convention
   * in the inspector, so the displayed model always matches the record.
   */
  applyGlbConventions(entity: ComponentEntity): void {
    if (!entity.usingGlb) return;
    const scale = entity.record.geometry.glbUnits === 'mm' ? MM : 1;
    for (const child of entity.modelHolder.children) {
      child.scale.setScalar(scale);
      // glTF standard content is Y-up; rotate +90° about X into the Z-up frame.
      child.rotation.set(entity.record.geometry.glbUpAxis === 'y' ? Math.PI / 2 : 0, 0, 0);
    }
    entity.syncObjectTransform();
    entity.refreshLocalAabb();
    entity.updateBaseAabb();
  }

  revertToPrimitives(entity: ComponentEntity): void {
    entity.rebuildPrimitives();
  }
}
