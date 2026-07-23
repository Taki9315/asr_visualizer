import type { EnclosureMode, SavedConfig, SavedPlacement, Vec3 } from '../types';
import type { ComponentRegistry } from '../core/Registry';
import type { CableManager } from './CableManager';
import { asCable } from '../data/validate';

/**
 * Feature 17: save/load robot configurations as JSON.
 * A configuration captures placements, visibility, enclosure mode, explode
 * factor and the (possibly edited) cable routes — not the component metadata,
 * which always comes from the dataset.
 */
export function buildConfig(
  registry: ComponentRegistry,
  cables: CableManager,
  enclosureMode: EnclosureMode,
  explodeFactor: number
): SavedConfig {
  const placements: Record<string, SavedPlacement> = {};
  const visibility: Record<string, boolean> = {};
  const locks: Record<string, boolean> = {};
  for (const entity of registry.entities) {
    placements[entity.id] = {
      positionMm: [...entity.basePositionMm] as Vec3,
      rotationDeg: [...entity.baseRotationDeg] as Vec3
    };
    visibility[entity.id] = entity.userVisible;
    locks[entity.id] = entity.record.locked;
  }
  return {
    formatVersion: 1,
    savedAtIso: new Date().toISOString(),
    appName: 'asr-visualizer',
    placements,
    visibility,
    locks,
    enclosureMode,
    explodeFactor,
    cables: cables.serialize(),
    notes:
      'ASR layout study configuration. Placements are provisional layout values, not released mechanical positions.'
  };
}

export function downloadConfig(config: SavedConfig): void {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = config.savedAtIso.replace(/[:.]/g, '-');
  a.href = url;
  a.download = `asr-config-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asVec3(v: unknown, label: string): Vec3 {
  if (
    !Array.isArray(v) ||
    v.length !== 3 ||
    v.some((c) => typeof c !== 'number' || !Number.isFinite(c))
  ) {
    throw new Error(`Config: ${label} is not a [x, y, z] number array`);
  }
  return [v[0] as number, v[1] as number, v[2] as number];
}

/** Parses and validates an uploaded config file. Throws descriptive errors. */
export function parseConfig(text: string): SavedConfig {
  const raw: unknown = JSON.parse(text);
  if (!isRecord(raw)) throw new Error('Config: expected a JSON object');
  if (raw['formatVersion'] !== 1) throw new Error('Config: unsupported formatVersion');
  if (raw['appName'] !== 'asr-visualizer') throw new Error('Config: not an asr-visualizer file');

  const placementsRaw = isRecord(raw['placements']) ? raw['placements'] : {};
  const placements: Record<string, SavedPlacement> = {};
  for (const [id, p] of Object.entries(placementsRaw)) {
    if (!isRecord(p)) throw new Error(`Config: placement for "${id}" is invalid`);
    placements[id] = {
      positionMm: asVec3(p['positionMm'], `placements.${id}.positionMm`),
      rotationDeg: asVec3(p['rotationDeg'], `placements.${id}.rotationDeg`)
    };
  }

  const visibilityRaw = isRecord(raw['visibility']) ? raw['visibility'] : {};
  const visibility: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(visibilityRaw)) {
    visibility[id] = v === true;
  }

  const locksRaw = isRecord(raw['locks']) ? raw['locks'] : {};
  const locks: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(locksRaw)) {
    locks[id] = v === true;
  }

  const mode = raw['enclosureMode'];
  const enclosureMode: EnclosureMode =
    mode === 'transparent' || mode === 'hidden' ? mode : 'solid';

  const explodeRaw = raw['explodeFactor'];
  const explodeFactor =
    typeof explodeRaw === 'number' && Number.isFinite(explodeRaw)
      ? Math.min(1, Math.max(0, explodeRaw))
      : 0;

  const cablesRaw = Array.isArray(raw['cables']) ? raw['cables'] : [];
  const cables = cablesRaw.map((c, i) => asCable(c, `config.cables[${i}]`));

  return {
    formatVersion: 1,
    savedAtIso: typeof raw['savedAtIso'] === 'string' ? raw['savedAtIso'] : '',
    appName: 'asr-visualizer',
    placements,
    visibility,
    locks,
    enclosureMode,
    explodeFactor,
    cables,
    notes: typeof raw['notes'] === 'string' ? raw['notes'] : ''
  };
}

/**
 * Applies a parsed config to the runtime. Unknown component ids are reported
 * back (dataset may have evolved since the config was saved).
 */
export function applyConfig(
  config: SavedConfig,
  registry: ComponentRegistry,
  cables: CableManager
): { unknownIds: string[] } {
  const unknownIds: string[] = [];
  for (const [id, placement] of Object.entries(config.placements)) {
    const entity = registry.get(id);
    if (!entity) {
      unknownIds.push(id);
      continue;
    }
    entity.basePositionMm = [...placement.positionMm];
    entity.baseRotationDeg = [...placement.rotationDeg];
    entity.syncObjectTransform();
    entity.updateBaseAabb();
  }
  for (const [id, visible] of Object.entries(config.visibility)) {
    const entity = registry.get(id);
    if (!entity) continue;
    entity.userVisible = visible;
    entity.applyVisibility();
  }
  for (const [id, locked] of Object.entries(config.locks)) {
    const entity = registry.get(id);
    if (!entity) continue;
    entity.record.locked = locked;
  }
  if (config.cables.length > 0) {
    cables.setRoutes(config.cables);
  }
  return { unknownIds };
}
