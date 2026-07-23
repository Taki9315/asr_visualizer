import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { ComponentEntity } from '../core/ComponentEntity';
import type { ManufacturingPartMeta } from '../core/models/ModelKit';
import { mVecToMm } from '../core/units';

export interface ManufacturingPartDescriptor {
  object: THREE.Object3D;
  meta: ManufacturingPartMeta;
  sizeMm: [number, number, number];
  minMm: [number, number, number];
  maxMm: [number, number, number];
  triangles: number;
}

function safeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function triangleCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const drawCount = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    count += Math.floor(drawCount / 3);
  });
  return count;
}

function asMeta(value: unknown): ManufacturingPartMeta | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<ManufacturingPartMeta>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.label !== 'string' ||
    typeof candidate.partNumber !== 'string' ||
    typeof candidate.material !== 'string' ||
    typeof candidate.process !== 'string' ||
    typeof candidate.printable !== 'boolean' ||
    typeof candidate.interfaceNote !== 'string'
  ) {
    return null;
  }
  return candidate as ManufacturingPartMeta;
}

export function listManufacturingParts(
  entity: ComponentEntity
): ManufacturingPartDescriptor[] {
  const parts: ManufacturingPartDescriptor[] = [];
  entity.modelHolder.updateMatrixWorld(true);
  const modelInverse = entity.modelHolder.matrixWorld.clone().invert();
  entity.modelHolder.traverse((object) => {
    const meta = asMeta(object.userData['manufacturingPart']);
    if (!meta) return;
    const worldBox = new THREE.Box3().setFromObject(object, true);
    const localBox = worldBox.clone().applyMatrix4(modelInverse);
    const size = new THREE.Vector3();
    localBox.getSize(size);
    parts.push({
      object,
      meta,
      sizeMm: mVecToMm(size),
      minMm: mVecToMm(localBox.min),
      maxMm: mVecToMm(localBox.max),
      triangles: triangleCount(object)
    });
  });
  return parts;
}

/**
 * STL is unitless; coordinates are deliberately emitted as millimetres and
 * kept in the component-local datum frame so separately exported parts retain
 * their assembly relationship when imported into SolidWorks or another CAD
 * package. Slicers can use "drop to bed" for individual print preparation.
 */
function exportObjectAsMillimetreStl(object: THREE.Object3D, fileName: string): void {
  const clone = object.clone(true);
  const exportRoot = new THREE.Group();
  exportRoot.name = 'millimetre-export-root';
  exportRoot.scale.setScalar(1000);
  exportRoot.add(clone);
  exportRoot.updateMatrixWorld(true);
  const result = new STLExporter().parse(exportRoot, { binary: true });
  downloadBlob(
    new Blob([result], { type: 'model/stl' }),
    `${safeFileName(fileName)}.stl`
  );
}

export function exportComponentStl(entity: ComponentEntity): void {
  const model = entity.modelHolder.children[0] ?? entity.modelHolder;
  exportObjectAsMillimetreStl(model, `${entity.id}-assembly-mm`);
}

export function exportManufacturingPartStl(
  entity: ComponentEntity,
  descriptor: ManufacturingPartDescriptor
): void {
  exportObjectAsMillimetreStl(
    descriptor.object,
    `${entity.id}-${descriptor.meta.partNumber}-${descriptor.meta.id}-mm`
  );
}

export function exportManufacturingManifest(
  entity: ComponentEntity,
  parts = listManufacturingParts(entity)
): void {
  const manifest = {
    format: 'asr-manufacturing-reference',
    formatVersion: 1,
    exportedAtIso: new Date().toISOString(),
    units: 'mm',
    coordinateFrame: {
      convention: 'component-local; +X robot forward, +Y robot left, +Z up',
      stlNote:
        'STL files are unitless but numeric coordinates are emitted in millimetres. Part exports preserve the shared component datum.'
    },
    engineeringStatus: {
      componentStatus: entity.record.status,
      sourceNote: entity.record.sourceNote,
      warning:
        'Reference/provisional mesh geometry is not a released production drawing. Verify vendor models, materials, tolerances, fasteners, wall sections and interfaces before manufacture.'
    },
    component: {
      id: entity.id,
      name: entity.record.name,
      bomRef: entity.record.bomRef,
      declaredEnvelopeMm: entity.record.physical.envelopeMm.size,
      modelledEnvelopeMm: entity.getLocalSizeMm()
    },
    parts: parts.map((partDescriptor) => ({
      ...partDescriptor.meta,
      boundsMm: {
        min: partDescriptor.minMm,
        max: partDescriptor.maxMm,
        size: partDescriptor.sizeMm
      },
      triangleCount: partDescriptor.triangles,
      stlFileStem: safeFileName(
        `${entity.id}-${partDescriptor.meta.partNumber}-${partDescriptor.meta.id}-mm`
      )
    }))
  };
  downloadBlob(
    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
    `${safeFileName(entity.id)}-manufacturing-manifest.json`
  );
}
