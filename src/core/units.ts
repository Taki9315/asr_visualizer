import * as THREE from 'three';
import type { Vec3 } from '../types';

/** Scene unit is metres; the data model is millimetres. */
export const MM = 0.001;

export function mmVecToM(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0] * MM, v[1] * MM, v[2] * MM);
}

export function mVecToMm(v: THREE.Vector3): Vec3 {
  return [round1(v.x / MM), round1(v.y / MM), round1(v.z / MM)];
}

export function degVecToEuler(v: Vec3): THREE.Euler {
  return new THREE.Euler(
    THREE.MathUtils.degToRad(v[0]),
    THREE.MathUtils.degToRad(v[1]),
    THREE.MathUtils.degToRad(v[2]),
    'XYZ'
  );
}

export function eulerToDegVec(e: THREE.Euler): Vec3 {
  return [
    round1(THREE.MathUtils.radToDeg(e.x)),
    round1(THREE.MathUtils.radToDeg(e.y)),
    round1(THREE.MathUtils.radToDeg(e.z))
  ];
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatMm(n: number): string {
  return `${round1(n).toFixed(1)} mm`;
}

export function formatVecMm(v: Vec3): string {
  return `[${v.map((c) => round1(c).toFixed(1)).join(', ')}] mm`;
}
