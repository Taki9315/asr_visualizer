import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MM } from '../units';

export type ModelParams = Record<string, number>;
export type ModelPalette = Record<string, string>;

export interface ManufacturingPartMeta {
  id: string;
  label: string;
  partNumber: string;
  material: string;
  process: string;
  printable: boolean;
  interfaceNote: string;
}

export interface PartOptions {
  partNumber: string;
  material: string;
  process: string;
  printable?: boolean;
  interfaceNote: string;
}

export function num(p: ModelParams | undefined, key: string, fallback: number): number {
  const value = p?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function col(palette: ModelPalette | undefined, key: string, fallback: string): string {
  return palette?.[key] ?? fallback;
}

export function standardMaterial(
  color: string,
  roughness = 0.68,
  metalness = 0.18,
  extra?: Partial<THREE.MeshStandardMaterialParameters>
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness,
    side: THREE.DoubleSide,
    ...extra
  });
}

export function glassMaterial(
  color: string,
  opacity = 0.78,
  transmission = 0.15
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.12,
    metalness: 0.08,
    transmission,
    transparent: true,
    opacity,
    depthWrite: opacity >= 0.95,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    side: THREE.DoubleSide
  });
}

export function merged(
  geometries: THREE.BufferGeometry[],
  material: THREE.Material,
  name?: string
): THREE.Mesh {
  const indexed = geometries.every((geometry) => geometry.index !== null);
  const normalized = geometries.map((geometry) => {
    if (indexed || geometry.index === null) return geometry;
    const clone = geometry.toNonIndexed();
    geometry.dispose();
    return clone;
  });
  const geometry = mergeGeometries(normalized, false);
  for (const source of normalized) source.dispose();
  const mesh = new THREE.Mesh(geometry ?? new THREE.BufferGeometry(), material);
  if (name) mesh.name = name;
  return mesh;
}

export function part(
  id: string,
  label: string,
  options: PartOptions,
  ...objects: THREE.Object3D[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = `part:${id}`;
  const meta: ManufacturingPartMeta = {
    id,
    label,
    partNumber: options.partNumber,
    material: options.material,
    process: options.process,
    printable: options.printable ?? true,
    interfaceNote: options.interfaceNote
  };
  group.userData['manufacturingPart'] = meta;
  for (const object of objects) group.add(object);
  return group;
}

export function boxAt(
  widthMm: number,
  depthMm: number,
  heightMm: number,
  xMm: number,
  yMm: number,
  zMm: number,
  rotZ = 0
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(widthMm * MM, depthMm * MM, heightMm * MM);
  if (rotZ !== 0) geometry.rotateZ(rotZ);
  geometry.translate(xMm * MM, yMm * MM, zMm * MM);
  return geometry;
}

export function roundedBoxAt(
  widthMm: number,
  depthMm: number,
  heightMm: number,
  radiusMm: number,
  xMm: number,
  yMm: number,
  zMm: number,
  rotZ = 0,
  segments = 3
): THREE.BufferGeometry {
  const safeRadius = Math.max(
    0.25,
    Math.min(radiusMm, widthMm * 0.22, depthMm * 0.22, heightMm * 0.22)
  );
  const geometry = new RoundedBoxGeometry(
    widthMm * MM,
    depthMm * MM,
    heightMm * MM,
    Math.max(1, segments),
    safeRadius * MM
  );
  if (rotZ !== 0) geometry.rotateZ(rotZ);
  geometry.translate(xMm * MM, yMm * MM, zMm * MM);
  return geometry;
}

/** Cylinder along Z, centred at x/y/z. */
export function cylZ(
  radiusTopMm: number,
  radiusBottomMm: number,
  heightMm: number,
  xMm: number,
  yMm: number,
  zMm: number,
  segments = 32
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    radiusTopMm * MM,
    radiusBottomMm * MM,
    heightMm * MM,
    segments
  );
  geometry.rotateX(Math.PI / 2);
  geometry.translate(xMm * MM, yMm * MM, zMm * MM);
  return geometry;
}

/** Cylinder along X, centred at x/y/z. */
export function cylX(
  radiusMm: number,
  lengthMm: number,
  xMm: number,
  yMm: number,
  zMm: number,
  segments = 24
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    radiusMm * MM,
    radiusMm * MM,
    lengthMm * MM,
    segments
  );
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(xMm * MM, yMm * MM, zMm * MM);
  return geometry;
}

/** Cylinder along Y, centred at x/y/z. */
export function cylY(
  radiusTopMm: number,
  radiusBottomMm: number,
  lengthMm: number,
  xMm: number,
  yMm: number,
  zMm: number,
  segments = 40
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    radiusTopMm * MM,
    radiusBottomMm * MM,
    lengthMm * MM,
    segments
  );
  geometry.translate(xMm * MM, yMm * MM, zMm * MM);
  return geometry;
}

export function cylinderBetween(
  startMm: THREE.Vector3,
  endMm: THREE.Vector3,
  radiusMm: number,
  segments = 18
): THREE.BufferGeometry {
  const start = startMm.clone().multiplyScalar(MM);
  const end = endMm.clone().multiplyScalar(MM);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(
    radiusMm * MM,
    radiusMm * MM,
    length,
    segments
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize()
    )
  );
  geometry.translate(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2
  );
  return geometry;
}

export function plateWithRoundHolesXY(
  widthMm: number,
  depthMm: number,
  thicknessMm: number,
  holes: Array<{ xMm: number; yMm: number; radiusMm: number }>,
  zCenterMm = 0
): THREE.BufferGeometry {
  const halfW = widthMm / 2;
  const halfD = depthMm / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW * MM, -halfD * MM);
  shape.lineTo(halfW * MM, -halfD * MM);
  shape.lineTo(halfW * MM, halfD * MM);
  shape.lineTo(-halfW * MM, halfD * MM);
  shape.closePath();
  for (const hole of holes) {
    const path = new THREE.Path();
    path.absarc(
      hole.xMm * MM,
      hole.yMm * MM,
      hole.radiusMm * MM,
      0,
      Math.PI * 2,
      false
    );
    shape.holes.push(path);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessMm * MM,
    bevelEnabled: false,
    curveSegments: 16
  });
  geometry.translate(0, 0, (zCenterMm - thicknessMm / 2) * MM);
  return geometry;
}

export function fastenerRing(
  count: number,
  pitchRadiusMm: number,
  axis: 'x' | 'y' | 'z',
  axialPositionMm: number,
  radiusMm = 3,
  heightMm = 3
): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const u = Math.cos(angle) * pitchRadiusMm;
    const v = Math.sin(angle) * pitchRadiusMm;
    if (axis === 'x') geometries.push(cylX(radiusMm, heightMm, axialPositionMm, u, v, 12));
    else if (axis === 'y') geometries.push(cylY(radiusMm, radiusMm, heightMm, u, axialPositionMm, v, 12));
    else geometries.push(cylZ(radiusMm, radiusMm, heightMm, u, v, axialPositionMm, 12));
  }
  return geometries;
}

export function roundedRailLoop(
  halfLengthMm: number,
  halfWidthMm: number,
  zMm: number,
  radiusMm: number,
  cornerCutMm: number
): THREE.BufferGeometry[] {
  const points = [
    new THREE.Vector3(halfLengthMm - cornerCutMm, halfWidthMm, zMm),
    new THREE.Vector3(-halfLengthMm + cornerCutMm, halfWidthMm, zMm),
    new THREE.Vector3(-halfLengthMm, halfWidthMm - cornerCutMm, zMm),
    new THREE.Vector3(-halfLengthMm, -halfWidthMm + cornerCutMm, zMm),
    new THREE.Vector3(-halfLengthMm + cornerCutMm, -halfWidthMm, zMm),
    new THREE.Vector3(halfLengthMm - cornerCutMm, -halfWidthMm, zMm),
    new THREE.Vector3(halfLengthMm, -halfWidthMm + cornerCutMm, zMm),
    new THREE.Vector3(halfLengthMm, halfWidthMm - cornerCutMm, zMm)
  ];
  const geometries: THREE.BufferGeometry[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    geometries.push(cylinderBetween(start, end, radiusMm, 18));
  }
  for (const point of points) {
    const elbow = new THREE.SphereGeometry(radiusMm * MM, 14, 10);
    elbow.translate(point.x * MM, point.y * MM, point.z * MM);
    geometries.push(elbow);
  }
  return geometries;
}

export function addEdgeLines(
  geometry: THREE.BufferGeometry,
  color = 0x2d3137,
  thresholdAngle = 28
): THREE.LineSegments {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, thresholdAngle),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
  );
  lines.userData['pickIgnore'] = true;
  return lines;
}
