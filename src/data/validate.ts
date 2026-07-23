import type {
  AppDataset,
  CableRouteRecord,
  ComponentRecord,
  PrimitivePart,
  StyledModelSpec,
  Vec3,
  ZoneRecord
} from '../types';

/**
 * Lightweight runtime validation for the JSON dataset. The goal is descriptive
 * failures at startup rather than exhaustive schema checking; the TypeScript
 * types remain the design-time contract.
 */

function fail(path: string, message: string): never {
  throw new Error(`Dataset validation failed at ${path}: ${message}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, `expected string, got ${typeof v}`);
  return v;
}

function asStringOrNull(v: unknown, path: string): string | null {
  if (v === null) return null;
  return asString(v, path);
}

function asBoolean(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, `expected boolean, got ${typeof v}`);
  return v;
}

function asNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, `expected finite number`);
  return v;
}

function asVec3(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) fail(path, 'expected [x, y, z] array');
  return [asNumber(v[0], `${path}[0]`), asNumber(v[1], `${path}[1]`), asNumber(v[2], `${path}[2]`)];
}

function asVec3OrNull(v: unknown, path: string): Vec3 | null {
  if (v === null) return null;
  return asVec3(v, path);
}

function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected array');
  return v;
}

function asProvisionalNumber(v: unknown, path: string): ComponentRecord['physical']['massKg'] {
  if (!isRecord(v)) fail(path, 'expected { value, provisional }');
  const out: ComponentRecord['physical']['massKg'] = {
    value: asNumber(v['value'], `${path}.value`),
    provisional: asBoolean(v['provisional'], `${path}.provisional`)
  };
  if (v['source'] !== undefined) out.source = asString(v['source'], `${path}.source`);
  return out;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  const s = asString(v, path);
  if (!(options as readonly string[]).includes(s)) {
    fail(path, `expected one of [${options.join(', ')}], got "${s}"`);
  }
  return s as T;
}

function asPrimitive(v: unknown, path: string): PrimitivePart {
  if (!isRecord(v)) fail(path, 'expected primitive object');
  const kind = oneOf(v['kind'], ['box', 'cylinder', 'sphere'] as const, `${path}.kind`);
  const offsetMm = v['offsetMm'] !== undefined ? asVec3(v['offsetMm'], `${path}.offsetMm`) : undefined;
  const rotationDeg =
    v['rotationDeg'] !== undefined ? asVec3(v['rotationDeg'], `${path}.rotationDeg`) : undefined;
  const colorHex = v['colorHex'] !== undefined ? asString(v['colorHex'], `${path}.colorHex`) : undefined;
  const base = {
    ...(offsetMm ? { offsetMm } : {}),
    ...(rotationDeg ? { rotationDeg } : {}),
    ...(colorHex ? { colorHex } : {})
  };
  if (kind === 'box') {
    return { kind, sizeMm: asVec3(v['sizeMm'], `${path}.sizeMm`), ...base };
  }
  if (kind === 'cylinder') {
    return {
      kind,
      radiusMm: asNumber(v['radiusMm'], `${path}.radiusMm`),
      lengthMm: asNumber(v['lengthMm'], `${path}.lengthMm`),
      axis: oneOf(v['axis'], ['x', 'y', 'z'] as const, `${path}.axis`),
      ...base
    };
  }
  return { kind, radiusMm: asNumber(v['radiusMm'], `${path}.radiusMm`), ...base };
}

const STYLED_KINDS = [
  'chassisFrame',
  'wheel',
  'bodyShell',
  'ptz',
  'lidar',
  'depthCamera',
  'antenna',
  'finnedBox',
  'pdu',
  'battery',
  'jetson',
  'modem'
] as const;

function asStyled(v: unknown, path: string): StyledModelSpec | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isRecord(v)) fail(path, 'expected styled-model object');
  const spec: StyledModelSpec = { kind: oneOf(v['kind'], STYLED_KINDS, `${path}.kind`) };
  if (v['paramsMm'] !== undefined) {
    if (!isRecord(v['paramsMm'])) fail(`${path}.paramsMm`, 'expected object of numbers');
    const params: Record<string, number> = {};
    for (const [k, val] of Object.entries(v['paramsMm'])) {
      params[k] = asNumber(val, `${path}.paramsMm.${k}`);
    }
    spec.paramsMm = params;
  }
  if (v['palette'] !== undefined) {
    if (!isRecord(v['palette'])) fail(`${path}.palette`, 'expected object of hex strings');
    const palette: Record<string, string> = {};
    for (const [k, val] of Object.entries(v['palette'])) {
      palette[k] = asString(val, `${path}.palette.${k}`);
    }
    spec.palette = palette;
  }
  return spec;
}

function asComponent(v: unknown, path: string): ComponentRecord {
  if (!isRecord(v)) fail(path, 'expected component object');
  const geometry = isRecord(v['geometry']) ? v['geometry'] : fail(`${path}.geometry`, 'missing');
  const placement = isRecord(v['placement']) ? v['placement'] : fail(`${path}.placement`, 'missing');
  const physical = isRecord(v['physical']) ? v['physical'] : fail(`${path}.physical`, 'missing');
  const envelope = isRecord(physical['envelopeMm'])
    ? physical['envelopeMm']
    : fail(`${path}.physical.envelopeMm`, 'missing');
  const power = isRecord(v['power']) ? v['power'] : fail(`${path}.power`, 'missing');
  const cooling = isRecord(v['cooling']) ? v['cooling'] : fail(`${path}.cooling`, 'missing');
  const service = isRecord(v['service']) ? v['service'] : fail(`${path}.service`, 'missing');

  return {
    id: asString(v['id'], `${path}.id`),
    name: asString(v['name'], `${path}.name`),
    bomRef: asStringOrNull(v['bomRef'] ?? null, `${path}.bomRef`),
    category: oneOf(
      v['category'],
      ['structure', 'enclosure', 'drive', 'energy', 'power', 'compute', 'sensor', 'comms'] as const,
      `${path}.category`
    ),
    parentId: asStringOrNull(v['parentId'] ?? null, `${path}.parentId`),
    zoneId: asStringOrNull(v['zoneId'] ?? null, `${path}.zoneId`),
    description: asString(v['description'], `${path}.description`),
    status: oneOf(v['status'], ['vendor-datasheet', 'provisional', 'assumed'] as const, `${path}.status`),
    sourceNote: asString(v['sourceNote'], `${path}.sourceNote`),
    geometry: {
      primitives: asArray(geometry['primitives'], `${path}.geometry.primitives`).map((p, i) =>
        asPrimitive(p, `${path}.geometry.primitives[${i}]`)
      ),
      ...(() => {
        const styled = asStyled(geometry['styled'], `${path}.geometry.styled`);
        return styled ? { styled } : {};
      })(),
      glbUrl: asStringOrNull(geometry['glbUrl'] ?? null, `${path}.geometry.glbUrl`),
      glbUnits: oneOf(geometry['glbUnits'] ?? 'm', ['m', 'mm'] as const, `${path}.geometry.glbUnits`),
      glbUpAxis: oneOf(geometry['glbUpAxis'] ?? 'z', ['z', 'y'] as const, `${path}.geometry.glbUpAxis`)
    },
    placement: {
      positionMm: asVec3(placement['positionMm'], `${path}.placement.positionMm`),
      rotationDeg: asVec3(placement['rotationDeg'], `${path}.placement.rotationDeg`)
    },
    physical: {
      massKg: asProvisionalNumber(physical['massKg'], `${path}.physical.massKg`),
      envelopeMm: {
        size: asVec3(envelope['size'], `${path}.physical.envelopeMm.size`),
        provisional: asBoolean(envelope['provisional'], `${path}.physical.envelopeMm.provisional`)
      }
    },
    power: {
      voltage: asString(power['voltage'], `${path}.power.voltage`),
      typicalW: asProvisionalNumber(power['typicalW'], `${path}.power.typicalW`),
      peakW: asProvisionalNumber(power['peakW'], `${path}.power.peakW`)
    },
    cooling: {
      method: asString(cooling['method'], `${path}.cooling.method`),
      notes: asString(cooling['notes'], `${path}.cooling.notes`),
      provisional: asBoolean(cooling['provisional'], `${path}.cooling.provisional`)
    },
    service: {
      access: asString(service['access'], `${path}.service.access`),
      interval: asString(service['interval'], `${path}.service.interval`),
      notes: asString(service['notes'], `${path}.service.notes`)
    },
    keepOuts: asArray(v['keepOuts'] ?? [], `${path}.keepOuts`).map((k, i) => {
      const kp = `${path}.keepOuts[${i}]`;
      if (!isRecord(k)) fail(kp, 'expected keep-out object');
      return {
        id: asString(k['id'], `${kp}.id`),
        label: asString(k['label'], `${kp}.label`),
        kind: oneOf(k['kind'], ['service-clearance', 'connector-keepout'] as const, `${kp}.kind`),
        sizeMm: asVec3(k['sizeMm'], `${kp}.sizeMm`),
        offsetMm: asVec3(k['offsetMm'], `${kp}.offsetMm`),
        provisional: asBoolean(k['provisional'], `${kp}.provisional`)
      };
    }),
    explodeDir: asVec3OrNull(v['explodeDir'] ?? null, `${path}.explodeDir`),
    locked: asBoolean(v['locked'], `${path}.locked`),
    isEnclosure: asBoolean(v['isEnclosure'], `${path}.isEnclosure`)
  };
}

function asZone(v: unknown, path: string): ZoneRecord {
  if (!isRecord(v)) fail(path, 'expected zone object');
  return {
    id: asString(v['id'], `${path}.id`),
    label: asString(v['label'], `${path}.label`),
    colorHex: asString(v['colorHex'], `${path}.colorHex`),
    centerMm: asVec3(v['centerMm'], `${path}.centerMm`),
    sizeMm: asVec3(v['sizeMm'], `${path}.sizeMm`),
    description: asString(v['description'], `${path}.description`),
    provisional: asBoolean(v['provisional'], `${path}.provisional`)
  };
}

export function asCable(v: unknown, path: string): CableRouteRecord {
  if (!isRecord(v)) fail(path, 'expected cable object');
  const points = asArray(v['pointsMm'], `${path}.pointsMm`).map((p, i) =>
    asVec3(p, `${path}.pointsMm[${i}]`)
  );
  if (points.length < 2) fail(`${path}.pointsMm`, 'a route needs at least 2 points');
  return {
    id: asString(v['id'], `${path}.id`),
    label: asString(v['label'], `${path}.label`),
    bomRef: asStringOrNull(v['bomRef'] ?? null, `${path}.bomRef`),
    fromId: asString(v['fromId'], `${path}.fromId`),
    toId: asString(v['toId'], `${path}.toId`),
    colorHex: asString(v['colorHex'], `${path}.colorHex`),
    diameterMm: asNumber(v['diameterMm'], `${path}.diameterMm`),
    pointsMm: points,
    provisional: asBoolean(v['provisional'], `${path}.provisional`)
  };
}

export function validateDataset(
  componentsRaw: unknown,
  zonesRaw: unknown,
  cablesRaw: unknown
): AppDataset {
  if (!isRecord(componentsRaw)) fail('components.json', 'expected top-level object');
  if (!isRecord(zonesRaw)) fail('zones.json', 'expected top-level object');
  if (!isRecord(cablesRaw)) fail('cables.json', 'expected top-level object');

  const components = asArray(componentsRaw['components'], 'components.json.components').map((c, i) =>
    asComponent(c, `components[${i}]`)
  );
  const zones = asArray(zonesRaw['zones'], 'zones.json.zones').map((z, i) => asZone(z, `zones[${i}]`));
  const cables = asArray(cablesRaw['cables'], 'cables.json.cables').map((c, i) =>
    asCable(c, `cables[${i}]`)
  );

  const ids = new Set<string>();
  for (const c of components) {
    if (ids.has(c.id)) fail(`components`, `duplicate component id "${c.id}"`);
    ids.add(c.id);
  }
  for (const c of components) {
    if (c.parentId !== null && !ids.has(c.parentId)) {
      fail(`components/${c.id}`, `parentId "${c.parentId}" does not exist`);
    }
  }
  const zoneIds = new Set(zones.map((z) => z.id));
  for (const c of components) {
    if (c.zoneId !== null && !zoneIds.has(c.zoneId)) {
      fail(`components/${c.id}`, `zoneId "${c.zoneId}" does not exist`);
    }
  }
  for (const cbl of cables) {
    if (!ids.has(cbl.fromId)) fail(`cables/${cbl.id}`, `fromId "${cbl.fromId}" does not exist`);
    if (!ids.has(cbl.toId)) fail(`cables/${cbl.id}`, `toId "${cbl.toId}" does not exist`);
  }

  return {
    disclaimer: asString(componentsRaw['disclaimer'] ?? '', 'components.json.disclaimer'),
    components,
    zones,
    cables
  };
}
