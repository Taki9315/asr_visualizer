/**
 * Shared type contract for the ASR layout simulator.
 *
 * Every dimension in this application traces back to ASR-ENG-001 Rev B and the
 * Rev B expanded BOM. Values that are not backed by a vendor datasheet or a
 * released drawing are flagged `provisional: true` and must not be used for
 * procurement or manufacturing decisions.
 */

/** Millimetre triple in the robot frame: +X forward, +Y left, +Z up. */
export type Vec3 = [number, number, number];

/** A numeric value with engineering provenance. */
export interface ProvisionalNumber {
  value: number;
  /** True when the value is a design-basis assumption, not a verified figure. */
  provisional: boolean;
  /** Where the value came from (BOM row, datasheet, assumption note). */
  source?: string;
}

export type Axis = 'x' | 'y' | 'z';

export type ComponentCategory =
  | 'structure'
  | 'enclosure'
  | 'drive'
  | 'energy'
  | 'power'
  | 'compute'
  | 'sensor'
  | 'comms';

/** Overall confidence of a component record. */
export type ComponentStatus = 'vendor-datasheet' | 'provisional' | 'assumed';

interface PrimitiveBase {
  /** Offset of the primitive centre from the component origin, mm. */
  offsetMm?: Vec3;
  /** Local rotation of the primitive, degrees XYZ. */
  rotationDeg?: Vec3;
  /** Optional colour override (hex, e.g. "#8a8f98"). */
  colorHex?: string;
}

export interface BoxPart extends PrimitiveBase {
  kind: 'box';
  sizeMm: Vec3;
}

export interface CylinderPart extends PrimitiveBase {
  kind: 'cylinder';
  radiusMm: number;
  lengthMm: number;
  /** Axis the cylinder length runs along, in component-local frame. */
  axis: Axis;
}

export interface SpherePart extends PrimitiveBase {
  kind: 'sphere';
  radiusMm: number;
}

export type PrimitivePart = BoxPart | CylinderPart | SpherePart;

/**
 * High-detail procedural model builders. Each kind is a parametric composite
 * (still driven by the JSON dimensions) that approximates the component's
 * real appearance; the plain primitives remain available as a fallback and
 * as the documented dimensional basis.
 */
export type StyledModelKind =
  | 'chassisFrame'
  | 'wheel'
  | 'bodyShell'
  | 'ptz'
  | 'lidar'
  | 'depthCamera'
  | 'antenna'
  | 'finnedBox'
  | 'pdu'
  | 'battery'
  | 'jetson'
  | 'modem';

export interface StyledModelSpec {
  kind: StyledModelKind;
  /** Parameter overrides in millimetres (defaults derive from the envelope). */
  paramsMm?: Record<string, number>;
  /** Colour overrides (hex strings). */
  palette?: Record<string, string>;
}

export type KeepOutKind = 'service-clearance' | 'connector-keepout';

export interface KeepOutVolume {
  id: string;
  label: string;
  kind: KeepOutKind;
  sizeMm: Vec3;
  /** Centre offset from the component origin, mm. */
  offsetMm: Vec3;
  provisional: boolean;
}

export interface ComponentGeometry {
  /** Parametric primitive representation (initial modelling state). */
  primitives: PrimitivePart[];
  /** Optional high-detail procedural representation (used when HD models are on). */
  styled?: StyledModelSpec;
  /**
   * Optional URL/path of a GLB replacing the primitives. The metadata and UI
   * are unaffected by which representation is active.
   */
  glbUrl: string | null;
  /** Unit convention of the GLB source (SolidWorks/STEP exports are often mm). */
  glbUnits: 'm' | 'mm';
  /**
   * Up-axis convention of the GLB source. 'y' (the glTF standard) is rotated
   * +90° about X into the robot's Z-up frame on import; 'z' is used as-is.
   */
  glbUpAxis: 'z' | 'y';
}

export interface ComponentPlacement {
  positionMm: Vec3;
  rotationDeg: Vec3;
}

export interface ComponentRecord {
  id: string;
  name: string;
  /** BOM row reference (e.g. "ASR-064") when one exists. */
  bomRef: string | null;
  category: ComponentCategory;
  /** Logical hierarchy parent (grouping only; placements stay world-frame). */
  parentId: string | null;
  zoneId: string | null;
  description: string;
  status: ComponentStatus;
  sourceNote: string;
  geometry: ComponentGeometry;
  placement: ComponentPlacement;
  physical: {
    massKg: ProvisionalNumber;
    envelopeMm: { size: Vec3; provisional: boolean };
  };
  power: {
    voltage: string;
    typicalW: ProvisionalNumber;
    peakW: ProvisionalNumber;
  };
  cooling: {
    method: string;
    notes: string;
    provisional: boolean;
  };
  service: {
    access: string;
    interval: string;
    notes: string;
  };
  keepOuts: KeepOutVolume[];
  /** Preferred explode direction (unit-ish vector); null = radial from centroid. */
  explodeDir: Vec3 | null;
  locked: boolean;
  isEnclosure: boolean;
}

export interface ZoneRecord {
  id: string;
  label: string;
  colorHex: string;
  centerMm: Vec3;
  sizeMm: Vec3;
  description: string;
  provisional: boolean;
}

export interface CableRouteRecord {
  id: string;
  label: string;
  /** BOM cable schedule reference (e.g. "CBL-006") when one exists. */
  bomRef: string | null;
  fromId: string;
  toId: string;
  colorHex: string;
  diameterMm: number;
  pointsMm: Vec3[];
  provisional: boolean;
}

export interface AppDataset {
  disclaimer: string;
  components: ComponentRecord[];
  zones: ZoneRecord[];
  cables: CableRouteRecord[];
}

export type EnclosureMode = 'solid' | 'transparent' | 'hidden';

export type ToolMode = 'select' | 'translate' | 'rotate' | 'measure' | 'cable-edit';

export type ViewPreset = 'perspective' | 'top' | 'front' | 'rear' | 'left' | 'right';

export interface SavedPlacement {
  positionMm: Vec3;
  rotationDeg: Vec3;
}

/** Serialised robot configuration (feature 17). */
export interface SavedConfig {
  formatVersion: 1;
  savedAtIso: string;
  appName: 'asr-visualizer';
  placements: Record<string, SavedPlacement>;
  visibility: Record<string, boolean>;
  locks: Record<string, boolean>;
  enclosureMode: EnclosureMode;
  explodeFactor: number;
  cables: CableRouteRecord[];
  notes: string;
}
