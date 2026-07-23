import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { ZoneRecord } from '../types';
import { MM, mmVecToM } from '../core/units';

/**
 * Feature 14: battery / compute / power / drive / sensor zone visualization.
 * Zones are translucent planning volumes; they take no part in picking.
 */
export class ZoneManager {
  readonly root = new THREE.Group();
  private readonly groups = new Map<string, THREE.Group>();
  readonly zones: readonly ZoneRecord[];

  constructor(zones: readonly ZoneRecord[]) {
    this.zones = zones;
    this.root.name = 'zones-root';
    this.root.visible = false;

    for (const zone of zones) {
      const group = new THREE.Group();
      group.name = `zone:${zone.id}`;
      const color = new THREE.Color(zone.colorHex);
      const geometry = new THREE.BoxGeometry(
        zone.sizeMm[0] * MM,
        zone.sizeMm[1] * MM,
        zone.sizeMm[2] * MM
      );
      const fill = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.09,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      fill.userData['pickIgnore'] = true;
      fill.renderOrder = 1;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 })
      );
      edges.userData['pickIgnore'] = true;
      group.add(fill);
      group.add(edges);

      const el = document.createElement('div');
      el.className = 'zone-label';
      el.textContent = zone.label;
      el.style.color = zone.colorHex;
      const label = new CSS2DObject(el);
      label.position.set(0, 0, (zone.sizeMm[2] / 2) * MM + 0.02);
      group.add(label);

      group.position.copy(mmVecToM(zone.centerMm));
      this.groups.set(zone.id, group);
      this.root.add(group);
    }
  }

  setAllVisible(on: boolean): void {
    this.root.visible = on;
  }

  isVisible(): boolean {
    return this.root.visible;
  }

  setZoneVisible(id: string, on: boolean): void {
    const g = this.groups.get(id);
    if (g) g.visible = on;
  }

  getZoneVisible(id: string): boolean {
    return this.groups.get(id)?.visible ?? false;
  }
}
