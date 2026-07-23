import * as THREE from 'three';
import type { ModelPalette, ModelParams } from './ModelKit';
import {
  boxAt,
  col,
  cylX,
  cylY,
  cylZ,
  cylinderBetween,
  merged,
  num,
  part,
  plateWithRoundHolesXY,
  roundedBoxAt,
  roundedRailLoop,
  standardMaterial
} from './ModelKit';
import { MM } from '../units';

function hullPoints(
  lengthMm: number,
  widthMm: number,
  noseCutMm: number,
  rearCutMm: number,
  scale = 1
): THREE.Vector2[] {
  const halfLength = (lengthMm / 2) * scale;
  const halfWidth = (widthMm / 2) * scale;
  const noseCut = noseCutMm * scale;
  const rearCut = rearCutMm * scale;
  return [
    new THREE.Vector2(halfLength - noseCut, halfWidth),
    new THREE.Vector2(halfLength, halfWidth - noseCut * 0.72),
    new THREE.Vector2(halfLength, -halfWidth + noseCut * 0.72),
    new THREE.Vector2(halfLength - noseCut, -halfWidth),
    new THREE.Vector2(-halfLength + rearCut, -halfWidth),
    new THREE.Vector2(-halfLength, -halfWidth + rearCut),
    new THREE.Vector2(-halfLength, halfWidth - rearCut),
    new THREE.Vector2(-halfLength + rearCut, halfWidth)
  ];
}

function pathFromPoints(points: readonly THREE.Vector2[], isShape: true): THREE.Shape;
function pathFromPoints(points: readonly THREE.Vector2[], isShape: false): THREE.Path;
function pathFromPoints(points: readonly THREE.Vector2[], isShape: boolean): THREE.Shape | THREE.Path {
  const path = isShape ? new THREE.Shape() : new THREE.Path();
  const first = points[0]!;
  path.moveTo(first.x * MM, first.y * MM);
  for (const point of points.slice(1)) path.lineTo(point.x * MM, point.y * MM);
  path.closePath();
  return path;
}

function hullLayer(
  lengthMm: number,
  widthMm: number,
  noseCutMm: number,
  rearCutMm: number,
  scale: number,
  z0Mm: number,
  z1Mm: number,
  bevelMm = 0
): THREE.BufferGeometry {
  const shape = pathFromPoints(
    hullPoints(lengthMm, widthMm, noseCutMm, rearCutMm, scale),
    true
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: (z1Mm - z0Mm) * MM,
    bevelEnabled: bevelMm > 0,
    bevelSize: bevelMm * MM,
    bevelThickness: bevelMm * MM,
    bevelSegments: bevelMm > 0 ? 2 : 1
  });
  geometry.translate(0, 0, z0Mm * MM);
  return geometry;
}

function hullGasket(
  lengthMm: number,
  widthMm: number,
  noseCutMm: number,
  rearCutMm: number,
  outerScale: number,
  innerScale: number,
  z0Mm: number,
  thicknessMm: number
): THREE.BufferGeometry {
  const shape = pathFromPoints(
    hullPoints(lengthMm, widthMm, noseCutMm, rearCutMm, outerScale),
    true
  );
  const inner = hullPoints(lengthMm, widthMm, noseCutMm, rearCutMm, innerScale).reverse();
  shape.holes.push(pathFromPoints(inner, false));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessMm * MM,
    bevelEnabled: false
  });
  geometry.translate(0, 0, z0Mm * MM);
  return geometry;
}

interface HullSection {
  lengthMm: number;
  widthMm: number;
  noseCutMm: number;
  rearCutMm: number;
}

/**
 * Watertight hollow armour loft. Each loft is a true closed wall section:
 * outer skin, inner skin and annular top/bottom returns share indexed edges.
 * This keeps the equipment bay empty instead of filling it with a capped
 * solid, while remaining suitable for STL export and later CAD recreation.
 */
function hullWallLoft(
  lowerSection: HullSection,
  upperSection: HullSection,
  z0Mm: number,
  z1Mm: number,
  wallMm = 12
): THREE.BufferGeometry {
  const sectionPoints = (section: HullSection, insetMm = 0): THREE.Vector2[] =>
    hullPoints(
      section.lengthMm - insetMm * 2,
      section.widthMm - insetMm * 2,
      Math.max(24, section.noseCutMm - insetMm * 0.34),
      Math.max(20, section.rearCutMm - insetMm * 0.28)
    );

  const outerLower = sectionPoints(lowerSection);
  const outerUpper = sectionPoints(upperSection);
  const innerLower = sectionPoints(lowerSection, wallMm);
  const innerUpper = sectionPoints(upperSection, wallMm);
  const rings = [
    { points: outerLower, zMm: z0Mm },
    { points: outerUpper, zMm: z1Mm },
    { points: innerLower, zMm: z0Mm },
    { points: innerUpper, zMm: z1Mm }
  ];
  const positions: number[] = [];
  for (const ring of rings) {
    for (const point of ring.points) {
      positions.push(point.x * MM, point.y * MM, ring.zMm * MM);
    }
  }

  const count = outerLower.length;
  const outerLowerStart = 0;
  const outerUpperStart = count;
  const innerLowerStart = count * 2;
  const innerUpperStart = count * 3;
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const ol = outerLowerStart + index;
    const oln = outerLowerStart + next;
    const ou = outerUpperStart + index;
    const oun = outerUpperStart + next;
    const il = innerLowerStart + index;
    const iln = innerLowerStart + next;
    const iu = innerUpperStart + index;
    const iun = innerUpperStart + next;

    // Outer and inner vertical/tapered skins.
    indices.push(ol, oln, oun, ol, oun, ou);
    indices.push(il, iu, iun, il, iun, iln);
    // Bottom and top returns close the printable wall section.
    indices.push(ol, il, iln, ol, iln, oln);
    indices.push(ou, oun, iun, ou, iun, iu);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function extrudedProfile(
  points: ReadonlyArray<readonly [number, number]>,
  thicknessMm: number,
  mapPoint: (u: number, v: number, depth: number) => readonly [number, number, number],
  bevelMm = 1.5
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const first = points[0]!;
  shape.moveTo(first[0] * MM, first[1] * MM);
  for (const point of points.slice(1)) shape.lineTo(point[0] * MM, point[1] * MM);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessMm * MM,
    bevelEnabled: bevelMm > 0,
    bevelSize: bevelMm * MM,
    bevelThickness: Math.min(bevelMm, thicknessMm * 0.35) * MM,
    bevelSegments: bevelMm > 0 ? 2 : 1,
    curveSegments: 8
  });
  const positions = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const mapped = mapPoint(point.x, point.y, point.z);
    positions.setXYZ(index, mapped[0], mapped[1], mapped[2]);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Profile coordinates are X/Z; the result follows the tapered side surface. */
function sideProfile(
  pointsXZ: ReadonlyArray<readonly [number, number]>,
  thicknessMm: number,
  yAtZ0Mm: number,
  side: number,
  taper = 0.1,
  bevelMm = 1.5
): THREE.BufferGeometry {
  return extrudedProfile(
    pointsXZ,
    thicknessMm,
    (x, z, depth) => [
      x,
      side * (yAtZ0Mm * MM - z * taper - depth),
      z
    ],
    bevelMm
  );
}

/** Profile coordinates are Y/Z; the result is a closed front-facing panel. */
function frontProfile(
  pointsYZ: ReadonlyArray<readonly [number, number]>,
  thicknessMm: number,
  xFaceMm: number,
  direction = 1,
  bevelMm = 1.5,
  rake = 0
): THREE.BufferGeometry {
  return extrudedProfile(
    pointsYZ,
    thicknessMm,
    (y, z, depth) => [
      direction * (xFaceMm * MM - z * rake - depth),
      y,
      z
    ],
    bevelMm
  );
}

/** Closed front-facing frame with a true through opening. */
function frontFrameProfile(
  outerPointsYZ: ReadonlyArray<readonly [number, number]>,
  innerPointsYZ: ReadonlyArray<readonly [number, number]>,
  thicknessMm: number,
  xFaceMm: number,
  bevelMm = 1.5,
  rake = 0
): THREE.BufferGeometry {
  const makePath = (
    points: ReadonlyArray<readonly [number, number]>,
    shape: boolean
  ): THREE.Shape | THREE.Path => {
    const path = shape ? new THREE.Shape() : new THREE.Path();
    const first = points[0]!;
    path.moveTo(first[0] * MM, first[1] * MM);
    for (const point of points.slice(1)) path.lineTo(point[0] * MM, point[1] * MM);
    path.closePath();
    return path;
  };
  const shape = makePath(outerPointsYZ, true) as THREE.Shape;
  shape.holes.push(makePath([...innerPointsYZ].reverse(), false) as THREE.Path);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessMm * MM,
    bevelEnabled: bevelMm > 0,
    bevelSize: bevelMm * MM,
    bevelThickness: Math.min(bevelMm, thicknessMm * 0.3) * MM,
    bevelSegments: bevelMm > 0 ? 2 : 1,
    curveSegments: 8
  });
  const positions = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    positions.setXYZ(
      index,
      xFaceMm * MM - point.y * rake - point.z,
      point.x,
      point.y
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Profile coordinates are X/Y; the result is a closed horizontal plate. */
function horizontalProfile(
  pointsXY: ReadonlyArray<readonly [number, number]>,
  thicknessMm: number,
  z0Mm: number,
  bevelMm = 1.5
): THREE.BufferGeometry {
  return extrudedProfile(
    pointsXY,
    thicknessMm,
    (x, y, depth) => [x, y, z0Mm * MM + depth],
    bevelMm
  );
}

export function buildChassisFrame(
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'chassis:manufacturing-assembly';
  const length = num(params, 'lenMm', 900);
  const width = num(params, 'widMm', 560);
  const height = num(params, 'hMm', 82);
  const aluminum = standardMaterial(col(palette, 'frame', '#626971'), 0.48, 0.72);
  const darkAluminum = standardMaterial(col(palette, 'tray', '#3b4148'), 0.55, 0.65);
  const hardware = standardMaterial('#b6bdc5', 0.28, 0.88);
  const isolation = standardMaterial('#17191c', 0.92, 0.02);

  const floorHoles = [
    { xMm: -340, yMm: -230, radiusMm: 5 },
    { xMm: -340, yMm: 230, radiusMm: 5 },
    { xMm: 340, yMm: -230, radiusMm: 5 },
    { xMm: 340, yMm: 230, radiusMm: 5 },
    { xMm: -150, yMm: -205, radiusMm: 4 },
    { xMm: -150, yMm: 205, radiusMm: 4 },
    { xMm: 150, yMm: -205, radiusMm: 4 },
    { xMm: 150, yMm: 205, radiusMm: 4 }
  ];
  root.add(
    part(
      'chassis-floor-pan',
      'Main floor pan with service drain and mounting pattern',
      {
        partNumber: 'ASR-011-01',
        material: '6061-T6 aluminium plate, provisional',
        process: 'Waterjet/CNC profile, drill, deburr',
        interfaceNote: 'M8 perimeter pattern to longitudinal rails; M6 equipment-grid holes.'
      },
      new THREE.Mesh(
        plateWithRoundHolesXY(length - 140, width - 80, 8, floorHoles, -1),
        aluminum
      )
    )
  );

  const railGeometries = [
    roundedBoxAt(length - 193, 34, 72, 4, -13, width / 2 - 25, height / 2 - 1),
    roundedBoxAt(length - 193, 34, 72, 4, -13, -width / 2 + 25, height / 2 - 1)
  ];
  root.add(
    part(
      'chassis-longitudinals',
      'Left and right boxed longitudinal rails',
      {
        partNumber: 'ASR-011-02',
        material: '6061-T6 aluminium rectangular tube, provisional',
        process: 'Cut, machine axle datum faces, TIG weld/bolt',
        interfaceNote: 'Rail datum faces locate all four torque plates and shell isolation mounts.'
      },
      ...railGeometries.map((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, aluminum);
        mesh.name = index === 0 ? 'left-longitudinal-rail' : 'right-longitudinal-rail';
        return mesh;
      })
    )
  );

  const crossmemberGeometries: THREE.BufferGeometry[] = [];
  for (const x of [-350, -145, 145, 325]) {
    crossmemberGeometries.push(roundedBoxAt(28, width - 86, 50, 3, x, 0, 29));
  }
  root.add(
    part(
      'chassis-crossmembers',
      'Front, rear and equipment-bay crossmembers',
      {
        partNumber: 'ASR-011-03',
        material: '6061-T6 aluminium rectangular tube, provisional',
        process: 'Cut and fixture weld/bolt',
        interfaceNote: 'M8 end plates tie both longitudinal rails; centre pair locates battery cradle.'
      },
      ...crossmemberGeometries.map((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, aluminum);
        mesh.name = `crossmember-${index + 1}`;
        return mesh;
      })
    )
  );

  const bracketObjects: THREE.Object3D[] = [];
  for (const x of [-280, 280]) {
    for (const ySign of [-1, 1]) {
      const bracket = plateWithRoundHolesXY(
        92,
        76,
        10,
        [
          { xMm: 0, yMm: 0, radiusMm: 10 },
          { xMm: -31, yMm: -25, radiusMm: 4.5 },
          { xMm: 31, yMm: -25, radiusMm: 4.5 },
          { xMm: -31, yMm: 25, radiusMm: 4.5 },
          { xMm: 31, yMm: 25, radiusMm: 4.5 }
        ]
      );
      bracket.rotateX(Math.PI / 2);
      bracket.translate(x * MM, ySign * (width / 2 - 7) * MM, 34 * MM);
      bracketObjects.push(new THREE.Mesh(bracket, aluminum));

      const boss = cylY(15, 15, 22, x, ySign * (width / 2), 34, 24);
      bracketObjects.push(new THREE.Mesh(boss, hardware));

      const gussetA = boxAt(52, 18, 34, x - 21, ySign * (width / 2 - 12), 17, 0);
      const gussetB = boxAt(52, 18, 34, x + 21, ySign * (width / 2 - 12), 17, 0);
      bracketObjects.push(new THREE.Mesh(gussetA, aluminum), new THREE.Mesh(gussetB, aluminum));
    }
  }
  root.add(
    part(
      'wheel-torque-brackets',
      'Four replaceable wheel torque plates and axle bosses',
      {
        partNumber: 'ASR-011-04',
        material: '7075-T6 aluminium plate plus stainless axle bosses, provisional',
        process: 'CNC mill and ream after fixture assembly',
        interfaceNote: 'Four-hole M8 rail pattern; central axle flat/diameter remains release-gate G-01.'
      },
      ...bracketObjects
    )
  );

  const trayGeometry = plateWithRoundHolesXY(
    390,
    288,
    5,
    [
      { xMm: -168, yMm: -118, radiusMm: 4.5 },
      { xMm: -168, yMm: 118, radiusMm: 4.5 },
      { xMm: 168, yMm: -118, radiusMm: 4.5 },
      { xMm: 168, yMm: 118, radiusMm: 4.5 }
    ],
    17
  );
  const trayLips = [
    roundedBoxAt(390, 10, 30, 2, 0, -139, 30),
    roundedBoxAt(390, 10, 30, 2, 0, 139, 30),
    roundedBoxAt(10, 268, 30, 2, -190, 0, 30),
    roundedBoxAt(10, 54, 30, 2, 190, -107, 30),
    roundedBoxAt(10, 54, 30, 2, 190, 107, 30)
  ];
  root.add(
    part(
      'battery-cradle',
      'Low-mounted removable battery cradle',
      {
        partNumber: 'ASR-011-05',
        material: '5052-H32 aluminium sheet, provisional',
        process: 'Laser cut, brake form, rivnut install',
        interfaceNote: 'Four M8 isolator points to crossmembers; captive top clamp remains pack-dependent.'
      },
      new THREE.Mesh(trayGeometry, darkAluminum),
      ...trayLips.map((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, darkAluminum);
        mesh.name = `battery-cradle-lip-${index + 1}`;
        return mesh;
      })
    )
  );

  const equipmentTrayObjects: THREE.Object3D[] = [];
  const traySpecs = [
    { id: 'power-pdu', x: 330, y: -100, w: 150, d: 250 },
    { id: 'power-converters', x: 270, y: 185, w: 190, d: 140 },
    { id: 'compute', x: -270, y: 170, w: 180, d: 160 },
    { id: 'drive', x: -300, y: -65, w: 190, d: 340 }
  ] as const;
  for (const tray of traySpecs) {
    const plate = plateWithRoundHolesXY(
      tray.w,
      tray.d,
      6,
      [
        { xMm: -tray.w / 2 + 14, yMm: -tray.d / 2 + 14, radiusMm: 4.2 },
        { xMm: -tray.w / 2 + 14, yMm: tray.d / 2 - 14, radiusMm: 4.2 },
        { xMm: tray.w / 2 - 14, yMm: -tray.d / 2 + 14, radiusMm: 4.2 },
        { xMm: tray.w / 2 - 14, yMm: tray.d / 2 - 14, radiusMm: 4.2 }
      ],
      65
    );
    plate.translate(tray.x * MM, tray.y * MM, 0);
    plate.name = `${tray.id}-equipment-tray`;
    equipmentTrayObjects.push(new THREE.Mesh(plate, darkAluminum));
    for (const xOffset of [-tray.w / 2 + 14, tray.w / 2 - 14]) {
      for (const yOffset of [-tray.d / 2 + 14, tray.d / 2 - 14]) {
        equipmentTrayObjects.push(
          new THREE.Mesh(
            cylZ(6, 8, 60, tray.x + xOffset, tray.y + yOffset, 34, 18),
            aluminum
          )
        );
      }
    }
  }
  root.add(
    part(
      'raised-equipment-trays',
      'Four structure-cleared internal equipment trays',
      {
        partNumber: 'ASR-011-08',
        material: '5052-H32 aluminium trays on 6061-T6 tubular standoffs',
        process: 'Laser cut, brake form and bolt to the chassis equipment grid',
        interfaceNote: 'Tray undersides sit above the crossmember crown; battery, compute, drive and power zones remain physically separated.'
      },
      ...equipmentTrayObjects
    )
  );

  const skidHoles = [
    { xMm: -370, yMm: -218, radiusMm: 5 },
    { xMm: -370, yMm: 218, radiusMm: 5 },
    { xMm: 0, yMm: -218, radiusMm: 5 },
    { xMm: 0, yMm: 218, radiusMm: 5 },
    { xMm: 370, yMm: -218, radiusMm: 5 },
    { xMm: 370, yMm: 218, radiusMm: 5 }
  ];
  root.add(
    part(
      'lower-skid',
      'Replaceable lower skid plate',
      {
        partNumber: 'ASR-011-06',
        material: 'UHMW-PE or 5052-H32 aluminium, selection TBD',
        process: 'CNC route/waterjet and countersink',
        interfaceNote: 'Six retained M8 fasteners; plate removes without disturbing drivetrain.'
      },
      new THREE.Mesh(
        plateWithRoundHolesXY(length - 70, width - 94, 6, skidHoles, -8),
        darkAluminum
      )
    )
  );

  const isolatorGeometries: THREE.BufferGeometry[] = [];
  const washerGeometries: THREE.BufferGeometry[] = [];
  for (const x of [-390, 0, 390]) {
    for (const y of [-232, 232]) {
      isolatorGeometries.push(cylZ(10, 10, 14, x, y, height + 2, 20));
      washerGeometries.push(cylZ(13, 13, 2, x, y, height + 10, 24));
    }
  }
  root.add(
    part(
      'shell-isolators',
      'Six enclosure isolation mounts and retained washers',
      {
        partNumber: 'ASR-011-07',
        material: 'EPDM 60A with zinc-nickel plated steel hardware',
        process: 'Purchased isolators; machined rail inserts',
        printable: false,
        interfaceNote: 'M8 studs locate enclosure datum plane; compression limited by steel sleeves.'
      },
      ...isolatorGeometries.map((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, isolation);
        mesh.name = `shell-isolator-${index + 1}`;
        return mesh;
      }),
      ...washerGeometries.map((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, hardware);
        mesh.name = `isolator-washer-${index + 1}`;
        return mesh;
      })
    )
  );

  return root;
}

export function buildWheel(
  componentId: string,
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = `${componentId}:wheel-reference-assembly`;
  const outerDiameter = num(params, 'odMm', 254);
  const width = num(params, 'widthMm', 63.5);
  const radius = outerDiameter / 2;
  const hubRadius = num(params, 'hubMm', 176) / 2;
  const bodyRadius = radius - 7;
  const rubber = standardMaterial(col(palette, 'tire', '#17191c'), 0.96, 0.01);
  const rubberDetail = standardMaterial(col(palette, 'tread', '#111315'), 0.99, 0);
  const silver = standardMaterial(col(palette, 'hub', '#c2c8ce'), 0.28, 0.88);
  const dark = standardMaterial(col(palette, 'hubCore', '#25282d'), 0.52, 0.62);
  const hardware = standardMaterial('#d6d9dc', 0.22, 0.92);
  const leftWheel = componentId.endsWith('fl') || componentId.endsWith('rl');
  const outboardSign = leftWheel ? 1 : -1;

  const tyreTubeRadius = Math.max(16, (radius - hubRadius - 3) / 2);
  const tyreMajorRadius = radius - tyreTubeRadius;
  const carcassGeometries: THREE.BufferGeometry[] = [];
  const roundedCarcass = new THREE.TorusGeometry(
    tyreMajorRadius * MM,
    tyreTubeRadius * MM,
    24,
    96
  );
  roundedCarcass.rotateX(Math.PI / 2);
  roundedCarcass.scale(1, width / (tyreTubeRadius * 2), 1);
  carcassGeometries.push(roundedCarcass);
  for (const side of [-1, 1]) {
    const sidewall = new THREE.TorusGeometry((hubRadius + 4) * MM, 4.5 * MM, 12, 72);
    sidewall.rotateX(Math.PI / 2);
    sidewall.translate(0, side * (width / 2 - 4) * MM, 0);
    carcassGeometries.push(sidewall);
  }
  root.add(
    part(
      'wheel-tyre-carcass',
      '10 x 2.5 inch pneumatic tyre carcass',
      {
        partNumber: `${componentId.toUpperCase()}-TYRE`,
        material: 'Commercial rubber tyre, exact compound TBD',
        process: 'Purchased component / fit-check reference',
        printable: false,
        interfaceNote: 'Bead mates to purchased hub-motor rim; loaded radius and pressure are TBD.'
      },
      merged(carcassGeometries, rubber, 'tyre-carcass')
    )
  );

  const treadGeometries: THREE.BufferGeometry[] = [];
  const treadCount = 30;
  for (let index = 0; index < treadCount; index += 1) {
    const angle = (index / treadCount) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const centre = roundedBoxAt(15, width * 0.39, 22, 2.2, 0, 0, 0);
      centre.rotateX(side * 0.48);
      centre.translate((radius - 5.5) * MM, side * width * 0.12 * MM, 0);
      centre.rotateY(angle);
      treadGeometries.push(centre);

      const shoulder = roundedBoxAt(14, width * 0.22, 20, 2, 0, 0, 0);
      shoulder.rotateX(-side * 0.24);
      shoulder.translate((radius - 7.5) * MM, side * width * 0.405 * MM, 0);
      shoulder.rotateY(angle + (index % 2 === 0 ? 0.025 : -0.025));
      treadGeometries.push(shoulder);
    }
  }
  root.add(
    part(
      'wheel-tread',
      'Chevron centre and shoulder tread array',
      {
        partNumber: `${componentId.toUpperCase()}-TREAD`,
        material: 'Commercial moulded rubber, reference geometry',
        process: 'Purchased component / visual and clearance reference',
        printable: false,
        interfaceNote: 'Integral with tyre carcass; block pitch approximated from supplied wheel photograph.'
      },
      merged(treadGeometries, rubberDetail, 'chevron-tread-array')
    )
  );

  const hubShellGeometries = [
    cylY(hubRadius - 2, hubRadius - 2, width * 0.56, 0, 0, 0, 64),
    cylY(hubRadius - 12, hubRadius - 12, width * 0.72, 0, 0, 0, 64)
  ];
  const rimRingGeometries: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const ring = new THREE.TorusGeometry((hubRadius - 6) * MM, 4.2 * MM, 12, 72);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, side * (width * 0.35) * MM, 0);
    rimRingGeometries.push(ring);
  }
  root.add(
    part(
      'wheel-hub-shell',
      'Hub-motor shell and bead-seat rings',
      {
        partNumber: `${componentId.toUpperCase()}-HUB`,
        material: 'Cast/machined aluminium hub-motor housing, vendor TBD',
        process: 'Purchased component / fit-check reference',
        printable: false,
        interfaceNote: 'Motor shell, rim and tyre bead are vendor-controlled; no fabrication dimensions released.'
      },
      merged(hubShellGeometries, dark, 'hub-motor-shell'),
      merged(rimRingGeometries, silver, 'hub-rim-rings')
    )
  );

  const coverGeometries: THREE.BufferGeometry[] = [];
  const retentionRingGeometries: THREE.BufferGeometry[] = [];
  const spokeGeometries: THREE.BufferGeometry[] = [];
  const boltGeometries: THREE.BufferGeometry[] = [];
  const centreHardwareGeometries: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const faceY = side * (width * 0.37 + 1);
    coverGeometries.push(
      cylY(hubRadius - 15, hubRadius - 15, 4.5, 0, faceY, 0, 64),
      cylY(34, 34, 6, 0, side * (width * 0.37 + 4), 0, 48)
    );
    const retainingRing = new THREE.TorusGeometry(
      (hubRadius - 12) * MM,
      4.4 * MM,
      12,
      72
    );
    retainingRing.rotateX(Math.PI / 2);
    retainingRing.translate(0, side * (width * 0.37 + 4.5) * MM, 0);
    retentionRingGeometries.push(retainingRing);
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const spoke = roundedBoxAt(
        39,
        5,
        13,
        2.2,
        hubRadius - 36,
        side * (width * 0.37 + 5),
        0
      );
      spoke.rotateY(angle);
      spokeGeometries.push(spoke);
      boltGeometries.push(
        cylY(
          4.3,
          4.3,
          5,
          Math.cos(angle) * (hubRadius - 11),
          side * (width * 0.37 + 7),
          Math.sin(angle) * (hubRadius - 11),
          16
        )
      );
    }
    centreHardwareGeometries.push(
      cylY(24, 24, 6, 0, side * (width * 0.37 + 7), 0, 48),
      cylY(13, 13, 9, 0, side * (width * 0.37 + 10), 0, 32),
      cylY(7, 7, 12, 0, side * (width * 0.37 + 16), 0, 24)
    );
  }
  root.add(
    part(
      'wheel-motor-covers',
      'Two removable hub-motor end covers',
      {
        partNumber: `${componentId.toUpperCase()}-COVER`,
        material: 'Powder-coated aluminium with stainless fasteners',
        process: 'Vendor purchased / visual reference',
        printable: false,
        interfaceNote: 'Six-bolt cover pattern shown for service planning; verify vendor PCD and seal.'
      },
      merged(coverGeometries, dark, 'motor-end-covers'),
      merged(retentionRingGeometries, silver, 'machined-retention-annuli'),
      merged(spokeGeometries, silver, 'six-lobed-cover-spider'),
      merged(boltGeometries, dark, 'cover-fasteners'),
      merged(centreHardwareGeometries, hardware, 'concentric-centre-hardware')
    )
  );

  const axleGeometries = [
    cylY(10, 10, width + 24, 0, 0, 0, 18),
    cylY(16, 16, width + 12, 0, 0, 0, 28)
  ];
  const nutGeometries: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const nut = cylY(14, 14, 9, 0, side * (width / 2 + 10), 0, 6);
    nutGeometries.push(nut);
  }
  root.add(
    part(
      'wheel-axle-hardware',
      'Axle, washers and locking nuts',
      {
        partNumber: `${componentId.toUpperCase()}-AXLE`,
        material: 'Hardened steel axle and locking hardware, vendor TBD',
        process: 'Purchased with hub motor',
        printable: false,
        interfaceNote: 'Axle flat/keying and torque-arm engagement are release-gate G-01.'
      },
      merged(axleGeometries, hardware, 'axle-and-washers'),
      merged(nutGeometries, dark, 'axle-locknuts')
    )
  );

  const stripeSpecs: Array<{ color: string; start: number }> = [
    { color: col(palette, 'stripeA', '#d43d3b'), start: 0.42 },
    { color: col(palette, 'stripeB', '#e0bd36'), start: 2.5 },
    { color: col(palette, 'stripeC', '#2686d7'), start: 4.58 }
  ];
  const stripeGroup = new THREE.Group();
  stripeGroup.name = 'sidewall-colour-indexing';
  for (const stripe of stripeSpecs) {
    const geometry = new THREE.TorusGeometry(
      (bodyRadius - 11) * MM,
      2.4 * MM,
      8,
      36,
      1.25
    );
    geometry.rotateZ(stripe.start);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, outboardSign * (width / 2 + 0.7) * MM, 0);
    stripeGroup.add(new THREE.Mesh(geometry, standardMaterial(stripe.color, 0.55, 0.18)));
  }
  root.add(
    part(
      'wheel-index-marks',
      'Red, yellow and blue wheel index marks',
      {
        partNumber: `${componentId.toUpperCase()}-MARK`,
        material: 'UV-stable paint or reflective tape',
        process: 'Apply after wheel balance verification',
        printable: false,
        interfaceNote: 'Surface-applied indexing only; does not affect the tyre/rim joint.'
      },
      stripeGroup
    )
  );

  const innerSign = leftWheel ? -1 : 1;
  root.add(
    part(
      'wheel-cable-exit',
      'Sealed inboard motor cable gland',
      {
        partNumber: `${componentId.toUpperCase()}-CABLE`,
        material: 'Vendor overmoulded axle gland and elastomer strain relief',
        process: 'Purchased with motor; cable continues inside the chassis rail',
        printable: false,
        interfaceNote: 'No loose external pigtail is modelled; conductors pass directly through the axle-side sealed chassis chase.'
      },
      new THREE.Mesh(
        cylY(7.5, 9, 14, -12, innerSign * (width / 2 + 2), -8, 18),
        dark
      ),
      new THREE.Mesh(
        cylY(5.2, 6.4, 10, -12, innerSign * (width / 2 + 10), -8, 18),
        dark
      )
    )
  );

  return root;
}

/**
 * High-fidelity concept enclosure.
 *
 * The render assembly remains dimensionally provisional, but every visible
 * armour module is a separately named closed solid with explicit mounting
 * intent. The large louvered black deck window from the concept art is
 * deliberately omitted: the top deck is a single continuous sealed panel.
 */
export function buildBodyShell(
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'enclosure:concept-fidelity-production-reference';
  const length = num(params, 'lenMm', 900);
  const width = num(params, 'widMm', 590);
  const height = num(params, 'hMm', 225);
  const bottom = -height / 2;
  const top = height / 2;
  const noseCut = num(params, 'noseCutMm', 106);
  const rearCut = num(params, 'rearCutMm', 72);

  const lowerSection: HullSection = {
    lengthMm: length - 8,
    widthMm: width - 10,
    noseCutMm: noseCut - 4,
    rearCutMm: rearCut
  };
  const shoulderSection: HullSection = {
    lengthMm: length,
    widthMm: width,
    noseCutMm: noseCut,
    rearCutMm: rearCut + 2
  };
  const roofSection: HullSection = {
    lengthMm: length - 16,
    widthMm: width - 50,
    noseCutMm: noseCut - 12,
    rearCutMm: rearCut - 8
  };

  const armour = standardMaterial(col(palette, 'hull', '#aeb3b7'), 0.39, 0.1);
  const deck = standardMaterial(col(palette, 'deck', '#969da3'), 0.43, 0.12);
  const graphite = standardMaterial(col(palette, 'skirt', '#25292e'), 0.64, 0.26);
  const trim = standardMaterial(col(palette, 'trim', '#161a1e'), 0.53, 0.4);
  const recess = standardMaterial('#0e1114', 0.92, 0.01);
  const hardware = standardMaterial('#d2d6da', 0.21, 0.93);
  const darkHardware = standardMaterial('#343a40', 0.42, 0.72);

  root.add(
    part(
      'enclosure-lower-armour-belt',
      'Graphite lower crash belt and sealed underbody skirt',
      {
        partNumber: 'ASR-014-01C',
        material: 'Powder-coated 5052-H32 aluminium with polymer corner skins',
        process: 'Brake form, fixture bond/bolt and edge seal',
        interfaceNote: 'Continuous lower datum mounts to the chassis rails through replaceable isolation strips.'
      },
      new THREE.Mesh(
        hullWallLoft(
          lowerSection,
          lowerSection,
          bottom + 4,
          bottom + 91,
          12
        ),
        graphite
      )
    )
  );

  root.add(
    part(
      'enclosure-shoulder-transition',
      'Outward faceted shoulder transition ring',
      {
        partNumber: 'ASR-014-02A',
        material: 'Satin light-grey powder-coated 5052-H32 aluminium, provisional 2.5 mm',
        process: 'Laser cut, brake form and bonded internal corner reinforcement',
        interfaceNote: 'Closed hollow ring overlaps the vertical lower tub and expands only at the armour shoulder.'
      },
      new THREE.Mesh(
        hullWallLoft(
          lowerSection,
          shoulderSection,
          bottom + 84,
          bottom + 115,
          12
        ),
        armour
      )
    )
  );

  root.add(
    part(
      'enclosure-tapered-upper-shell',
      'Inward-tapered faceted upper armour shell',
      {
        partNumber: 'ASR-014-02C',
        material: 'Satin light-grey powder-coated 5052-H32 aluminium, provisional 2.5 mm',
        process: 'Laser cut, multi-stage brake form and bonded corner reinforcement',
        interfaceNote: 'Hollow wall loft leaves one continuous equipment cavity; its roof return receives the sealed removable deck.'
      },
      new THREE.Mesh(
        hullWallLoft(
          shoulderSection,
          roofSection,
          bottom + 108,
          top - 21,
          12
        ),
        armour
      )
    )
  );

  const shellTabObjects: THREE.Object3D[] = [];
  for (const x of [-390, 0, 390]) {
    for (const side of [-1, 1]) {
      shellTabObjects.push(
        new THREE.Mesh(
          roundedBoxAt(74, 58, 6, 3, x, side * 250, bottom + 93, 0),
          graphite
        ),
        new THREE.Mesh(
          cylZ(5, 5, 7, x, side * 232, bottom + 95, 18),
          darkHardware
        )
      );
    }
  }
  root.add(
    part(
      'shell-to-chassis-mounting-tabs',
      'Six inward lower-shell mounting tabs',
      {
        partNumber: 'ASR-014-01D',
        material: '5052-H32 aluminium tabs with stainless crush sleeves',
        process: 'Laser cut, brake form and fixture bond/bolt to lower wall',
        interfaceNote: 'Tabs positively overlap the six chassis isolation washers while leaving the centre floor and service cavity open.'
      },
      ...shellTabObjects
    )
  );

  const sideOuter: Array<readonly [number, number]> = [
    [-length / 2 + 50, bottom + 91],
    [-length / 2 + 103, bottom + 193],
    [length / 2 - 118, bottom + 193],
    [length / 2 - 43, bottom + 117],
    [length / 2 - 65, bottom + 87],
    [-length / 2 + 70, bottom + 87]
  ];
  const sideInner: Array<readonly [number, number]> = [
    [-length / 2 + 66, bottom + 98],
    [-length / 2 + 112, bottom + 184],
    [length / 2 - 126, bottom + 184],
    [length / 2 - 57, bottom + 115],
    [length / 2 - 74, bottom + 96],
    [-length / 2 + 80, bottom + 96]
  ];
  const sideArmourObjects: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    sideArmourObjects.push(
      new THREE.Mesh(sideProfile(sideOuter, 5, 292.5, side, 0.17, 2), recess),
      new THREE.Mesh(sideProfile(sideInner, 4, 294.5, side, 0.17, 2.2), armour)
    );
    const fastenerXs = [
      -length / 2 + 118,
      -length / 2 + 26,
      -90,
      90,
      length / 2 - 156,
      length / 2 - 83
    ];
    for (const x of fastenerXs) {
      for (const z of [bottom + 108, bottom + 170]) {
        const y = side * (296 - z * 0.17);
        sideArmourObjects.push(
          new THREE.Mesh(cylY(3.2, 3.2, 3.5, x, y, z, 12), darkHardware)
        );
      }
    }
  }
  root.add(
    part(
      'faceted-side-armour-panels',
      'Two removable trapezoidal side armour panels with physical seam reveals',
      {
        partNumber: 'ASR-014-03C',
        material: 'Powder-coated aluminium skins over closed-cell perimeter gasket',
        process: 'Laser cut, brake form, PEM insert and gasket bond',
        interfaceNote: 'Retained M5 socket screws locate each panel; the seam is a 2–3 mm sealed reveal.'
      },
      ...sideArmourObjects
    )
  );

  const shoulderObjects: THREE.Object3D[] = [];
  const coverBottom = top - 32;
  for (const x of [-280, 280]) {
    for (const side of [-1, 1]) {
      const topPlan: Array<readonly [number, number]> = [
        [x - 122, side * 270],
        [x - 94, side * 330],
        [x + 94, side * 330],
        [x + 122, side * 270],
        [x + 108, side * 258],
        [x - 108, side * 258]
      ];
      const seamPlan = topPlan.map(
        ([px, py]) => [px, py - side * 3] as const
      );
      const outerLip: Array<readonly [number, number]> = [
        [x - 94, coverBottom],
        [x + 94, coverBottom],
        [x + 108, coverBottom + 9],
        [x + 94, coverBottom + 22],
        [x - 94, coverBottom + 22],
        [x - 108, coverBottom + 9]
      ];
      shoulderObjects.push(
        new THREE.Mesh(
          horizontalProfile(seamPlan, 3, coverBottom, 1.2),
          recess
        ),
        new THREE.Mesh(
          horizontalProfile(topPlan, 14, coverBottom + 3, 2.5),
          armour
        ),
        new THREE.Mesh(
          sideProfile(outerLip, 8, 330, side, 0, 2),
          armour
        )
      );
    }
  }
  root.add(
    part(
      'wheel-shoulder-facets',
      'Four shallow angular wheel-cover shoulder assemblies',
      {
        partNumber: 'ASR-014-03D',
        material: 'Formed aluminium corner armour with elastomer seam strip',
        process: 'Laser cut, brake form and bolt to upper-shell hardpoints',
        interfaceNote: 'Each cover overlaps only the inner tyre crown, retains over 30 mm vertical clearance and leaves the outward wheel-removal path open.'
      },
      ...shoulderObjects
    )
  );

  const beltHatchObjects: THREE.Object3D[] = [];
  const beltOuter: Array<readonly [number, number]> = [
    [-150, bottom + 24],
    [150, bottom + 24],
    [162, bottom + 34],
    [162, bottom + 72],
    [150, bottom + 82],
    [-150, bottom + 82],
    [-162, bottom + 72],
    [-162, bottom + 34]
  ];
  const beltInner: Array<readonly [number, number]> = [
    [-142, bottom + 31],
    [142, bottom + 31],
    [153, bottom + 39],
    [153, bottom + 67],
    [142, bottom + 75],
    [-142, bottom + 75],
    [-153, bottom + 67],
    [-153, bottom + 39]
  ];
  for (const side of [-1, 1]) {
    beltHatchObjects.push(
      new THREE.Mesh(sideProfile(beltOuter, 4, 291, side, 0, 1.5), recess),
      new THREE.Mesh(sideProfile(beltInner, 4, 293, side, 0, 1.8), graphite)
    );
    for (const x of [-126, 126]) {
      for (const z of [bottom + 40, bottom + 66]) {
        beltHatchObjects.push(
          new THREE.Mesh(
            cylY(2.8, 2.8, 3.5, x, side * 295, z, 12),
            hardware
          )
        );
      }
    }
  }
  root.add(
    part(
      'lower-belt-service-hatches',
      'Flush left/right lower-belt service hatches',
      {
        partNumber: 'ASR-014-03E',
        material: 'Graphite powder-coated aluminium with silicone gasket',
        process: 'Laser cut, shallow brake form and retained-fastener install',
        interfaceNote: 'Hatches expose the wheel harness clamps while the main deck remains sealed.'
      },
      ...beltHatchObjects
    )
  );

  const lidGeometry = hullLayer(
    roofSection.lengthMm - 12,
    roofSection.widthMm - 18,
    roofSection.noseCutMm - 4,
    roofSection.rearCutMm - 4,
    1,
    top - 22,
    top - 2,
    2
  );
  const gasketGeometry = hullGasket(
    roofSection.lengthMm - 8,
    roofSection.widthMm - 12,
    roofSection.noseCutMm - 2,
    roofSection.rearCutMm - 2,
    1,
    0.962,
    top - 25,
    4
  );
  root.add(
    part(
      'sealed-top-deck',
      'Continuous sealed satin-grey top deck',
      {
        partNumber: 'ASR-014-04C',
        material: 'Powder-coated aluminium lid with continuous silicone compression gasket',
        process: 'Brake form, CNC datum finish and retained insert installation',
        interfaceNote: 'The deck is fully closed: no black air window, louver bank or open grille is present.'
      },
      new THREE.Mesh(gasketGeometry, recess),
      new THREE.Mesh(lidGeometry, deck)
    )
  );

  const lidFasteners: THREE.BufferGeometry[] = [];
  for (const x of [-356, -238, -118, 0, 118, 238, 356]) {
    lidFasteners.push(cylZ(3.1, 3.1, 3, x, width * 0.43, top, 12));
    lidFasteners.push(cylZ(3.1, 3.1, 3, x, -width * 0.43, top, 12));
  }
  for (const y of [-172, -86, 0, 86, 172]) {
    lidFasteners.push(cylZ(3.1, 3.1, 3, length * 0.445, y, top, 12));
    lidFasteners.push(cylZ(3.1, 3.1, 3, -length * 0.445, y, top, 12));
  }
  root.add(
    part(
      'deck-retained-fasteners',
      'Recessed retained deck fastener set',
      {
        partNumber: 'ASR-014-HW1C',
        material: 'A4 stainless M5 low-head socket screws and sealing washers',
        process: 'Purchased retained hardware',
        printable: false,
        interfaceNote: 'Systematic perimeter spacing controls gasket compression and creates the render panel rhythm.'
      },
      merged(lidFasteners, darkHardware, 'recessed-deck-fasteners')
    )
  );

  const sensorZ = bottom + 171;
  const fasciaOpening: Array<readonly [number, number]> = [
    [-116, sensorZ - 23],
    [116, sensorZ - 23],
    [124, sensorZ - 17],
    [124, sensorZ + 17],
    [116, sensorZ + 23],
    [-116, sensorZ + 23],
    [-124, sensorZ + 17],
    [-124, sensorZ - 17]
  ];
  const fasciaOuter: Array<readonly [number, number]> = [
    [-width * 0.455, bottom + 91],
    [-width * 0.43, bottom + 163],
    [-width * 0.375, top - 23],
    [width * 0.375, top - 23],
    [width * 0.43, bottom + 163],
    [width * 0.455, bottom + 91],
    [width * 0.42, bottom + 78],
    [-width * 0.42, bottom + 78]
  ];
  const fasciaInner: Array<readonly [number, number]> = [
    [-width * 0.44, bottom + 96],
    [-width * 0.416, bottom + 160],
    [-width * 0.365, top - 30],
    [width * 0.365, top - 30],
    [width * 0.416, bottom + 160],
    [width * 0.44, bottom + 96],
    [width * 0.407, bottom + 85],
    [-width * 0.407, bottom + 85]
  ];
  root.add(
    part(
      'front-faceted-fascia',
      'Layered faceted front armour fascia',
      {
        partNumber: 'ASR-014-05C',
        material: 'Powder-coated aluminium fascia with black sealed edge reveal',
        process: 'Brake form over replaceable bumper carrier',
        interfaceNote: 'The raked fascia independently carries the camera bezel and both lamp cartridges.'
      },
      new THREE.Mesh(
        frontFrameProfile(
          fasciaOuter,
          fasciaOpening,
          24,
          length / 2 + 8,
          2,
          0.055
        ),
        recess
      ),
      new THREE.Mesh(
        frontFrameProfile(
          fasciaInner,
          fasciaOpening,
          18,
          length / 2 + 12,
          2.2,
          0.055
        ),
        armour
      )
    )
  );

  const lowerBumperProfile: Array<readonly [number, number]> = [
    [-width * 0.415, bottom + 8],
    [width * 0.415, bottom + 8],
    [width * 0.455, bottom + 31],
    [width * 0.442, bottom + 79],
    [-width * 0.442, bottom + 79],
    [-width * 0.455, bottom + 31]
  ];
  const skidProfile: Array<readonly [number, number]> = [
    [-118, bottom + 4],
    [118, bottom + 4],
    [145, bottom + 25],
    [132, bottom + 51],
    [-132, bottom + 51],
    [-145, bottom + 25]
  ];
  root.add(
    part(
      'front-bumper-and-skid',
      'Graphite lower bumper beam and replaceable centre skid',
      {
        partNumber: 'ASR-014-05D',
        material: 'Glass-filled nylon bumper cover over aluminium beam; replaceable UHMW skid',
        process: 'Additive fit-check prototype, then mould/machine production pieces',
        interfaceNote: 'Centre skid removes independently; bumper geometry reserves future safety switch segmentation.'
      },
      new THREE.Mesh(frontProfile(lowerBumperProfile, 28, length / 2 + 28, 1, 3, 0.04), trim),
      new THREE.Mesh(frontProfile(skidProfile, 14, length / 2 + 39, 1, 2, 0.02), graphite)
    )
  );

  const sensorOuter: Array<readonly [number, number]> = [
    [-108, sensorZ - 22],
    [-96, sensorZ - 34],
    [96, sensorZ - 34],
    [108, sensorZ - 22],
    [108, sensorZ + 22],
    [96, sensorZ + 34],
    [-96, sensorZ + 34],
    [-108, sensorZ + 22]
  ];
  const sensorInner: Array<readonly [number, number]> = [
    [-91, sensorZ - 22],
    [91, sensorZ - 22],
    [98, sensorZ - 15],
    [98, sensorZ + 15],
    [91, sensorZ + 22],
    [-91, sensorZ + 22],
    [-98, sensorZ + 15],
    [-98, sensorZ - 15]
  ];
  const sensorCarrierObjects: THREE.Object3D[] = [
    new THREE.Mesh(
      frontFrameProfile(
        sensorOuter,
        sensorInner,
        24,
        length / 2 + 39,
        2.5,
        0.055
      ),
      trim
    )
  ];
  for (const y of [-44, 44]) {
    for (const z of [sensorZ - 11, sensorZ + 11]) {
      sensorCarrierObjects.push(
        new THREE.Mesh(
          cylX(7, 22, length / 2 - 5, y, z, 20),
          darkHardware
        )
      );
    }
  }
  root.add(
    part(
      'front-camera-recess',
      'Chamfered protective recess for the real D435i module',
      {
        partNumber: 'ASR-014-06C',
        material: 'UV-stable black ASA/PA12 prototype over machined carrier',
        process: 'SLS prototype; gasketed moulded or machined production bezel',
        interfaceNote: 'A true through opening and four backing bosses seat the separate D435i carrier without intersecting its calibrated housing.'
      },
      ...sensorCarrierObjects
    )
  );

  const lampObjects: THREE.Object3D[] = [];
  const lampLens = standardMaterial('#f4f8fa', 0.18, 0.06, {
    emissive: new THREE.Color('#e4f0f6'),
    emissiveIntensity: 1.15
  });
  const lampProfile: Array<readonly [number, number]> = [
    [-39, -18],
    [39, -18],
    [44, -12],
    [44, 12],
    [39, 18],
    [-39, 18],
    [-44, 12],
    [-44, -12]
  ];
  for (const side of [-1, 1]) {
    const centreY = side * 181;
    const translated = lampProfile.map(
      ([y, z]) => [y + centreY, z + sensorZ] as const
    );
    lampObjects.push(
      new THREE.Mesh(
        extrudedProfile(
          translated,
          12,
          (y, z, depth) => [
            (length / 2 + 24) * MM - z * 0.055 - depth,
            y,
            z
          ],
          2
        ),
        trim
      )
    );
    for (const yOffset of [-21, 0, 21]) {
      const lampX = length / 2 + 24 - sensorZ * 0.055;
      lampObjects.push(
        new THREE.Mesh(
          cylX(5.7, 4.5, lampX + 2, centreY + yOffset, sensorZ, 20),
          lampLens
        ),
        new THREE.Mesh(
          cylX(2.1, 5.2, lampX + 5, centreY + yOffset, sensorZ, 16),
          hardware
        )
      );
    }
  }
  root.add(
    part(
      'front-three-optic-lamps',
      'Symmetric three-optic sealed headlamp cartridges',
      {
        partNumber: 'ASR-014-07C',
        material: 'Purchased IP-rated LED optics in printed/machined gasket carriers',
        process: 'Purchased optics; replaceable bezel cartridge',
        printable: false,
        interfaceNote: 'Three evenly spaced emitters and chamfered black carriers reproduce the reference fascia.'
      },
      ...lampObjects
    )
  );

  const ptzX = -250;
  const pedestalPlan: Array<readonly [number, number]> = [
    [ptzX - 68, -78],
    [ptzX + 68, -78],
    [ptzX + 82, -64],
    [ptzX + 82, 64],
    [ptzX + 68, 78],
    [ptzX - 68, 78],
    [ptzX - 82, 64],
    [ptzX - 82, -64]
  ];
  const pedestalTopPlan: Array<readonly [number, number]> = [
    [ptzX - 56, -66],
    [ptzX + 56, -66],
    [ptzX + 68, -54],
    [ptzX + 68, 54],
    [ptzX + 56, 66],
    [ptzX - 56, 66],
    [ptzX - 68, 54],
    [ptzX - 68, -54]
  ];
  const pedestalObjects: THREE.Object3D[] = [
    new THREE.Mesh(horizontalProfile(pedestalPlan, 4, top - 4, 2), recess),
    new THREE.Mesh(horizontalProfile(pedestalPlan, 26, top - 1, 5), armour),
    new THREE.Mesh(horizontalProfile(pedestalTopPlan, 8, top + 23, 3), deck),
    new THREE.Mesh(roundedBoxAt(190, 178, 6, 4, ptzX, 0, top - 27), graphite)
  ];
  for (const xOffset of [-49, 49]) {
    for (const yOffset of [-49, 49]) {
      pedestalObjects.push(
        new THREE.Mesh(
          cylZ(3.8, 3.8, 3, ptzX + xOffset, yOffset, top + 31, 14),
          darkHardware
        )
      );
    }
  }
  root.add(
    part(
      'integrated-ptz-pedestal',
      'Deck-integrated clipped-corner PTZ pedestal and internal doubler',
      {
        partNumber: 'ASR-014-10A',
        material: 'CNC-machined 6061-T6 pedestal over 5052-H32 internal doubler',
        process: 'Machine datums, seal, bolt through deck and finish coat',
        interfaceNote: 'Positive overlap joins deck, pedestal and PTZ base; PoE enters through the completely internal central chase.'
      },
      ...pedestalObjects
    )
  );

  const sensorHardpointObjects: THREE.Object3D[] = [
    new THREE.Mesh(roundedBoxAt(100, 100, 8, 6, 285, 105, top + 1, 0), recess),
    new THREE.Mesh(roundedBoxAt(92, 92, 8, 5, 285, 105, top + 4, 0), deck),
    new THREE.Mesh(roundedBoxAt(52, 52, 7, 5, -365, -205, top + 1, 0), recess),
    new THREE.Mesh(roundedBoxAt(44, 44, 7, 4, -365, -205, top + 4, 0), deck)
  ];
  root.add(
    part(
      'sealed-sensor-hardpoints',
      'LiDAR and single external antenna sealed deck hardpoints',
      {
        partNumber: 'ASR-014-10B',
        material: 'Machined aluminium datum pads with captive inserts and silicone seals',
        process: 'CNC face, drill/ream, install inserts and seal to deck',
        interfaceNote: 'Both cable continuations pass directly through internal chases; no loose wiring is exposed above the deck.'
      },
      ...sensorHardpointObjects
    )
  );

  const railZ = top + 40;
  const railGeometries = roundedRailLoop(
    length / 2 - 58,
    width / 2 - 28,
    railZ,
    7.5,
    48
  );
  const stanchions: Array<[number, number]> = [
    [length / 2 - 102, width / 2 - 28],
    [0, width / 2 - 28],
    [-length / 2 + 102, width / 2 - 28],
    [length / 2 - 102, -width / 2 + 28],
    [0, -width / 2 + 28],
    [-length / 2 + 102, -width / 2 + 28],
    [length / 2 - 58, 0],
    [-length / 2 + 58, 0]
  ];
  const railHardware: THREE.BufferGeometry[] = [];
  for (const [x, y] of stanchions) {
    railGeometries.push(
      cylinderBetween(
        new THREE.Vector3(x, y, top + 2),
        new THREE.Vector3(x, y, railZ),
        6.5,
        20
      ),
      cylZ(10, 10, 7, x, y, railZ - 3, 20)
    );
    railHardware.push(
      cylZ(15, 15, 4, x, y, top + 1, 20),
      cylZ(2.5, 2.5, 3, x + 7, y, top + 4, 12),
      cylZ(2.5, 2.5, 3, x - 7, y, top + 4, 12)
    );
  }
  root.add(
    part(
      'continuous-deck-rail',
      'Continuous eight-post perimeter protection rail',
      {
        partNumber: 'ASR-014-09C',
        material: 'Black e-coated stainless tube with machined clamp collars',
        process: 'Mandrel bend, fixture weld and e-coat',
        printable: false,
        interfaceNote: 'Eight sealed two-bolt feet and visible collars reproduce the concept rail rhythm.'
      },
      merged(railGeometries, trim, 'continuous-rounded-perimeter-rail'),
      merged(railHardware, darkHardware, 'rail-feet-and-fasteners')
    )
  );

  const hingeGeometries: THREE.BufferGeometry[] = [];
  for (const x of [-220, 220]) {
    hingeGeometries.push(
      roundedBoxAt(68, 9, 14, 2, x, -width * 0.466, top - 11),
      cylX(6.5, 72, x, -width * 0.474, top - 4, 18)
    );
  }
  const latchGeometries: THREE.BufferGeometry[] = [];
  for (const x of [-220, 0, 220]) {
    latchGeometries.push(
      roundedBoxAt(31, 10, 45, 3, x, width * 0.466, top - 35)
    );
  }
  root.add(
    part(
      'flush-hinges-and-latches',
      'Low-profile sealed hinges and compression latches',
      {
        partNumber: 'ASR-014-HW2C',
        material: 'Black passivated stainless hardware with internal backing plates',
        process: 'Purchased retained hardware',
        printable: false,
        interfaceNote: 'Hardware sits below the rail line and maintains an uninterrupted armour silhouette.'
      },
      merged(hingeGeometries, darkHardware, 'low-profile-hinges'),
      merged(latchGeometries, trim, 'compression-latches')
    )
  );

  const recoveryObjects: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const ring = new THREE.TorusGeometry(17 * MM, 5 * MM, 12, 28, Math.PI * 1.7);
    ring.rotateZ(Math.PI * 0.15);
    ring.rotateY(Math.PI / 2);
    ring.translate(
      (length / 2 + 29) * MM,
      side * 145 * MM,
      (bottom + 58) * MM
    );
    recoveryObjects.push(
      new THREE.Mesh(ring, darkHardware),
      new THREE.Mesh(
        cylY(6.2, 6.2, 42, length / 2 + 18, side * 145, bottom + 72, 18),
        hardware
      )
    );
  }
  root.add(
    part(
      'front-recovery-shackles',
      'Twin chassis-backed front recovery shackles',
      {
        partNumber: 'ASR-014-HW3C',
        material: 'Forged zinc-nickel steel shackles and stainless pins',
        process: 'Purchased rated hardware',
        printable: false,
        interfaceNote: 'Pins pass through chassis-backed lugs; no recovery load is carried by the cosmetic bumper.'
      },
      ...recoveryObjects
    )
  );

  const rearFasciaOuter: Array<readonly [number, number]> = [
    [-width * 0.455, bottom + 76],
    [-width * 0.438, bottom + 164],
    [-width * 0.39, top - 22],
    [width * 0.39, top - 22],
    [width * 0.438, bottom + 164],
    [width * 0.455, bottom + 76]
  ];
  const rearFasciaInner: Array<readonly [number, number]> = [
    [-width * 0.442, bottom + 83],
    [-width * 0.426, bottom + 160],
    [-width * 0.38, top - 29],
    [width * 0.38, top - 29],
    [width * 0.426, bottom + 160],
    [width * 0.442, bottom + 83]
  ];
  const rearServiceOuter: Array<readonly [number, number]> = [
    [-184, bottom + 31],
    [184, bottom + 31],
    [194, bottom + 42],
    [194, bottom + 111],
    [184, bottom + 121],
    [-184, bottom + 121],
    [-194, bottom + 111],
    [-194, bottom + 42]
  ];
  const rearServiceInner: Array<readonly [number, number]> = [
    [-172, bottom + 39],
    [172, bottom + 39],
    [183, bottom + 49],
    [183, bottom + 104],
    [172, bottom + 113],
    [-172, bottom + 113],
    [-183, bottom + 104],
    [-183, bottom + 49]
  ];
  const rearBumperProfile: Array<readonly [number, number]> = [
    [-width * 0.43, bottom + 5],
    [width * 0.43, bottom + 5],
    [width * 0.46, bottom + 27],
    [width * 0.445, bottom + 77],
    [-width * 0.445, bottom + 77],
    [-width * 0.46, bottom + 27]
  ];
  root.add(
    part(
      'rear-fascia-service-panel-and-bumper',
      'Joined rear armour fascia, recessed service panel and lower bumper',
      {
        partNumber: 'ASR-014-11A',
        material: 'Formed 5052-H32 fascia with graphite polymer bumper and sealed service door',
        process: 'Laser cut, brake form, insert installation and gasket bond',
        interfaceNote: 'Deep return flanges overlap the rear hull wall; lamps and E-stops seat into this continuous backed fascia instead of floating.'
      },
      new THREE.Mesh(frontProfile(rearFasciaOuter, 25, length / 2 + 9, -1, 2, 0.04), recess),
      new THREE.Mesh(frontProfile(rearFasciaInner, 18, length / 2 + 13, -1, 2.2, 0.04), armour),
      new THREE.Mesh(frontProfile(rearServiceOuter, 12, length / 2 + 16, -1, 2, 0.02), recess),
      new THREE.Mesh(frontProfile(rearServiceInner, 8, length / 2 + 12, -1, 2, 0.02), graphite),
      new THREE.Mesh(frontProfile(rearBumperProfile, 28, length / 2 + 32, -1, 3, 0.025), trim)
    )
  );

  const rearSafetyObjects: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const y = side * 150;
    rearSafetyObjects.push(
      new THREE.Mesh(cylX(16, 12, -length / 2 - 8, y, bottom + 120, 28), trim),
      new THREE.Mesh(
        cylX(11, 12, -length / 2 - 17, y, bottom + 120, 28),
        standardMaterial('#c73531', 0.42, 0.12)
      )
    );
  }
  root.add(
    part(
      'rear-recessed-estops',
      'Two discreet rear-corner emergency-stop stations',
      {
        partNumber: 'ASR-014-SAF1C',
        material: 'Purchased latching dual-channel E-stop devices',
        process: 'Purchased safety hardware in sealed recessed backing cups',
        printable: false,
        interfaceNote: 'Production safety controls remain accessible without adding red protrusions to the concept front fascia.'
      },
      ...rearSafetyObjects
    )
  );

  const rearMarkerGeometries: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    rearMarkerGeometries.push(
      roundedBoxAt(9, 58, 15, 3, -length / 2 - 8, side * 177, bottom + 166)
    );
  }
  root.add(
    part(
      'rear-smoked-marker-lamps',
      'Low-profile smoked rear marker lamps',
      {
        partNumber: 'ASR-014-08C',
        material: 'Purchased IP-rated red LED modules with smoked lenses',
        process: 'Purchased sealed assembly',
        printable: false,
        interfaceNote: 'Flush rear mounting keeps the side and front concept views visually clean.'
      },
      merged(
        rearMarkerGeometries,
        standardMaterial('#43191b', 0.3, 0.08, {
          emissive: new THREE.Color('#7b2024'),
          emissiveIntensity: 0.45
        }),
        'rear-smoked-markers'
      )
    )
  );

  const glandGeometries = [
    cylZ(11, 14, 12, ptzX, 0, top - 18, 20),
    cylZ(9, 12, 10, 285, 105, top - 18, 20),
    cylZ(8, 11, 10, -365, -205, top - 18, 20)
  ];
  root.add(
    part(
      'sealed-deck-glands',
      'Internal sensor cable penetration glands',
      {
        partNumber: 'ASR-014-HW4C',
        material: 'Nickel-plated brass glands with EPDM seals',
        process: 'Purchased IP-rated hardware',
        printable: false,
        interfaceNote: 'All three glands remain below the opaque deck and feed directly into the PTZ pedestal, LiDAR riser and single antenna bulkhead.'
      },
      merged(glandGeometries, hardware, 'internal-sealed-deck-glands')
    )
  );

  return root;
}
