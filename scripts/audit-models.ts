import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import componentsJson from '../src/data/components.json';
import zonesJson from '../src/data/zones.json';
import cablesJson from '../src/data/cables.json';
import { buildStyledModel } from '../src/core/StyledModels';
import { ComponentRegistry } from '../src/core/Registry';
import { validateDataset } from '../src/data/validate';
import { CollisionManager } from '../src/features/CollisionManager';
import type { ManufacturingPartMeta } from '../src/core/models/ModelKit';

interface MeshAudit {
  name: string;
  triangles: number;
  openEdges: number;
}

function edgeAudit(mesh: THREE.Mesh): MeshAudit {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  if (!position) return { name: mesh.name, triangles: 0, openEdges: 0 };
  const vertices = new Map<string, number>();
  const remap: number[] = [];
  const vector = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vector.fromBufferAttribute(position as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
    const key = `${Math.round(vector.x * 1e7)},${Math.round(vector.y * 1e7)},${Math.round(vector.z * 1e7)}`;
    let mapped = vertices.get(key);
    if (mapped === undefined) {
      mapped = vertices.size;
      vertices.set(key, mapped);
    }
    remap.push(mapped);
  }
  const rawIndex: number[] = [];
  if (index) {
    for (let i = 0; i < index.count; i += 1) rawIndex.push(index.getX(i));
  } else {
    for (let i = 0; i < position.count; i += 1) rawIndex.push(i);
  }
  const edges = new Map<string, number>();
  for (let i = 0; i + 2 < rawIndex.length; i += 3) {
    const a = remap[rawIndex[i]!]!;
    const b = remap[rawIndex[i + 1]!]!;
    const c = remap[rawIndex[i + 2]!]!;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a]
    ]) {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return {
    name: mesh.name,
    triangles: Math.floor(rawIndex.length / 3),
    openEdges: [...edges.values()].filter((count) => count === 1).length
  };
}

function manufacturingMeta(object: THREE.Object3D): ManufacturingPartMeta | null {
  const value = object.userData['manufacturingPart'] as ManufacturingPartMeta | undefined;
  return value ?? null;
}

const dataset = validateDataset(componentsJson, zonesJson, cablesJson);
const failures: string[] = [];
const report = [];

for (const record of dataset.components) {
  const model = buildStyledModel(record);
  if (!record.geometry.styled) continue;
  if (!model) {
    failures.push(`${record.id}: styled builder returned null`);
    continue;
  }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = new THREE.Vector3();
  box.getSize(size).multiplyScalar(1000);
  if (
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    !Number.isFinite(size.z) ||
    size.lengthSq() === 0
  ) {
    failures.push(`${record.id}: invalid or empty model bounds`);
  }

  const parts: Array<{ object: THREE.Object3D; meta: ManufacturingPartMeta }> = [];
  let meshCount = 0;
  let triangleCount = 0;
  model.traverse((object) => {
    const meta = manufacturingMeta(object);
    if (meta) parts.push({ object, meta });
    if (object instanceof THREE.Mesh) {
      meshCount += 1;
      const position = object.geometry.getAttribute('position');
      const index = object.geometry.index;
      triangleCount += Math.floor((index?.count ?? position?.count ?? 0) / 3);
    }
    const searchable = object.name.toLowerCase();
    if (
      searchable.includes('louvered air') ||
      searchable.includes('air window') ||
      searchable.includes('vented equipment hatch')
    ) {
      failures.push(`${record.id}: prohibited exterior top-air-window geometry found`);
    }
  });

  if (parts.length === 0) failures.push(`${record.id}: no named manufacturing parts`);
  const partIds = new Set<string>();
  for (const { object, meta } of parts) {
    if (partIds.has(meta.id)) failures.push(`${record.id}: duplicate part id ${meta.id}`);
    partIds.add(meta.id);
    if (!meta.printable) continue;
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const audit = edgeAudit(child);
      if (audit.triangles === 0) {
        failures.push(`${record.id}/${meta.id}/${child.name || 'mesh'}: zero triangles`);
      }
      if (audit.openEdges > 0) {
        failures.push(
          `${record.id}/${meta.id}/${child.name || 'mesh'}: ${audit.openEdges} open mesh edges`
        );
      }
    });
  }

  report.push({
    component: record.id,
    styledKind: record.geometry.styled.kind,
    modelSizeMm: [size.x, size.y, size.z].map((value) => Number(value.toFixed(2))),
    declaredEnvelopeMm: record.physical.envelopeMm.size,
    namedParts: parts.length,
    prototypePrintableParts: parts.filter(({ meta }) => meta.printable).length,
    meshes: meshCount,
    triangles: triangleCount
  });
}

const registry = new ComponentRegistry(dataset.components);
const collisionReport = new CollisionManager(registry).update();
const stlProbeRoot = new THREE.Group();
stlProbeRoot.scale.setScalar(1000);
const stlProbeModel = registry.get('enclosure')?.modelHolder.children[0];
if (stlProbeModel) stlProbeRoot.add(stlProbeModel.clone(true));
stlProbeRoot.updateMatrixWorld(true);
const stlProbe = new STLExporter().parse(stlProbeRoot, { binary: true });
const stlProbeBytes = stlProbe.byteLength;
if (stlProbeBytes <= 84) failures.push('binary STL export probe produced no triangle payload');
console.log(
  JSON.stringify(
    {
      components: report,
      assembly: {
        componentCount: registry.entities.length,
        collisionPairs: collisionReport.pairs,
        keepOutViolations: collisionReport.keepOutViolations,
        binaryStlProbeBytes: stlProbeBytes
      },
      failures
    },
    null,
    2
  )
);
if (failures.length > 0) process.exitCode = 1;
