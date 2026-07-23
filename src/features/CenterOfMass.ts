import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Vec3 } from '../types';
import type { ComponentRegistry } from '../core/Registry';
import { mVecToMm } from '../core/units';

export interface ComResult {
  comMm: Vec3 | null;
  totalKg: number;
  provisionalMassCount: number;
  componentCount: number;
}

/**
 * Feature 16: centre-of-mass from component base positions and masses.
 * Uses each component's geometric centre as its local COM (an approximation —
 * flagged in the UI). Hidden components still carry mass; explode offsets are
 * display-only and do not move the COM.
 */
export class CenterOfMassManager {
  readonly marker = new THREE.Group();
  private readonly labelEl: HTMLDivElement;

  constructor(private readonly registry: ComponentRegistry) {
    this.marker.name = 'com-marker';
    this.marker.visible = false;

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff4fd0, depthTest: false })
    );
    sphere.renderOrder = 22;
    sphere.userData['pickIgnore'] = true;
    this.marker.add(sphere);

    const axisLen = 0.22;
    const mkLine = (dir: THREE.Vector3, color: number): THREE.Line => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        dir.clone().multiplyScalar(-axisLen),
        dir.clone().multiplyScalar(axisLen)
      ]);
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 })
      );
      line.renderOrder = 22;
      line.userData['pickIgnore'] = true;
      return line;
    };
    this.marker.add(mkLine(new THREE.Vector3(1, 0, 0), 0xd95757));
    this.marker.add(mkLine(new THREE.Vector3(0, 1, 0), 0x57d96a));
    this.marker.add(mkLine(new THREE.Vector3(0, 0, 1), 0x57a0d9));

    this.labelEl = document.createElement('div');
    this.labelEl.className = 'com-label';
    this.labelEl.textContent = 'COM';
    const label = new CSS2DObject(this.labelEl);
    label.position.set(0, 0, 0.045);
    this.marker.add(label);
  }

  setVisible(on: boolean): void {
    this.marker.visible = on;
  }

  isVisible(): boolean {
    return this.marker.visible;
  }

  compute(): ComResult {
    let totalKg = 0;
    let provisionalMassCount = 0;
    let componentCount = 0;
    const weighted = new THREE.Vector3();

    for (const entity of this.registry.entities) {
      const mass = entity.record.physical.massKg;
      if (mass.value <= 0) continue;
      componentCount += 1;
      if (mass.provisional) provisionalMassCount += 1;
      totalKg += mass.value;
      weighted.addScaledVector(entity.getBaseCenterWorld(), mass.value);
    }

    if (totalKg <= 0) {
      return { comMm: null, totalKg: 0, provisionalMassCount, componentCount };
    }
    weighted.divideScalar(totalKg);
    return {
      comMm: mVecToMm(weighted),
      totalKg: Math.round(totalKg * 100) / 100,
      provisionalMassCount,
      componentCount
    };
  }

  /** Recomputes and repositions the marker; returns the result for the UI. */
  refresh(): ComResult {
    const result = this.compute();
    if (result.comMm) {
      this.marker.position.set(
        result.comMm[0] / 1000,
        result.comMm[1] / 1000,
        result.comMm[2] / 1000
      );
      this.labelEl.textContent = `COM  z=${result.comMm[2].toFixed(0)} mm`;
    }
    return result;
  }
}
