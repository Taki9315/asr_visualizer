import * as THREE from 'three';
import type { ComponentCategory, ComponentRecord, KeepOutVolume, PrimitivePart } from '../types';
import { buildStyledModel } from './StyledModels';
import { MM, degVecToEuler, mmVecToM } from './units';

/** Global model-detail mode: high-detail procedural models vs plain primitives. */
let detailedModels = true;

export function setDetailedModels(on: boolean): void {
  detailedModels = on;
}

export function getDetailedModels(): boolean {
  return detailedModels;
}

/**
 * Builds the parametric model for a record: the high-detail styled composite
 * when available (and HD mode is on), otherwise the plain primitives. Both
 * paths stamp componentId and shadow flags on every mesh.
 */
export function buildComponentModel(record: ComponentRecord): THREE.Group {
  let group: THREE.Group | null = null;
  if (detailedModels) group = buildStyledModel(record);
  if (!group) group = buildPrimitiveModel(record);
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData['componentId'] = record.id;
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return group;
}

/** Fallback colours per category when a primitive has no explicit colour. */
export const CATEGORY_COLORS: Record<ComponentCategory, string> = {
  structure: '#6f747d',
  enclosure: '#9aa0a8',
  drive: '#4a4e56',
  energy: '#c79a3c',
  power: '#c46a3f',
  compute: '#3fa06a',
  sensor: '#d7dade',
  comms: '#8f5fd0'
};

export const KEEPOUT_COLORS: Record<KeepOutVolume['kind'], number> = {
  'service-clearance': 0x35b8c9,
  'connector-keepout': 0xc94fb0
};

export const KEEPOUT_VIOLATION_COLOR = 0xff8f2b;

function buildPrimitiveGeometry(part: PrimitivePart): THREE.BufferGeometry {
  switch (part.kind) {
    case 'box': {
      const [x, y, z] = part.sizeMm;
      return new THREE.BoxGeometry(x * MM, y * MM, z * MM);
    }
    case 'cylinder': {
      const geo = new THREE.CylinderGeometry(
        part.radiusMm * MM,
        part.radiusMm * MM,
        part.lengthMm * MM,
        32
      );
      // CylinderGeometry length runs along +Y; bake the requested axis in.
      if (part.axis === 'x') geo.rotateZ(Math.PI / 2);
      else if (part.axis === 'z') geo.rotateX(Math.PI / 2);
      return geo;
    }
    case 'sphere':
      return new THREE.SphereGeometry(part.radiusMm * MM, 32, 24);
  }
}

/** Builds the parametric primitive representation for a component record. */
export function buildPrimitiveModel(record: ComponentRecord): THREE.Group {
  const group = new THREE.Group();
  group.name = `${record.id}:model`;
  for (const part of record.geometry.primitives) {
    const geometry = buildPrimitiveGeometry(part);
    const color = part.colorHex ?? CATEGORY_COLORS[record.category];
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.72,
      metalness: 0.15,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (part.offsetMm) mesh.position.copy(mmVecToM(part.offsetMm));
    if (part.rotationDeg) mesh.rotation.copy(degVecToEuler(part.rotationDeg));
    mesh.userData['componentId'] = record.id;
    group.add(mesh);
  }
  return group;
}

/** Builds translucent keep-out volumes (service clearance / connector keep-out). */
export function buildKeepOutGroup(record: ComponentRecord): THREE.Group {
  const group = new THREE.Group();
  group.name = `${record.id}:keepouts`;
  for (const ko of record.keepOuts) {
    const geometry = new THREE.BoxGeometry(
      ko.sizeMm[0] * MM,
      ko.sizeMm[1] * MM,
      ko.sizeMm[2] * MM
    );
    const color = KEEPOUT_COLORS[ko.kind];
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(mmVecToM(ko.offsetMm));
    mesh.userData['keepOutId'] = ko.id;
    mesh.userData['pickIgnore'] = true;
    mesh.renderOrder = 2;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 })
    );
    edges.userData['pickIgnore'] = true;
    mesh.add(edges);
    group.add(mesh);
  }
  return group;
}

/** Disposes geometries and materials below an object. */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}
