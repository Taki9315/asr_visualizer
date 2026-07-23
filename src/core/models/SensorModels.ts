import * as THREE from 'three';
import type { ModelPalette, ModelParams } from './ModelKit';
import {
  col,
  cylX,
  cylY,
  cylZ,
  fastenerRing,
  glassMaterial,
  merged,
  num,
  part,
  plateWithRoundHolesXY,
  roundedBoxAt,
  standardMaterial
} from './ModelKit';
import { MM } from '../units';

export function buildPtz(
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'ptz:mast-and-camera-assembly';
  const mastHeight = num(params, 'mastMm', 85);
  const white = standardMaterial(col(palette, 'body', '#e7e9ea'), 0.33, 0.06);
  const whiteTrim = standardMaterial('#d8dde1', 0.38, 0.12);
  const dark = standardMaterial(col(palette, 'band', '#25292e'), 0.42, 0.42);
  const hardware = standardMaterial('#aeb5bc', 0.24, 0.9);

  const basePlate = plateWithRoundHolesXY(
    124,
    124,
    10,
    [
      { xMm: -49, yMm: -49, radiusMm: 4.5 },
      { xMm: -49, yMm: 49, radiusMm: 4.5 },
      { xMm: 49, yMm: -49, radiusMm: 4.5 },
      { xMm: 49, yMm: 49, radiusMm: 4.5 }
    ],
    5
  );
  const baseFasteners = [
    ...fastenerRing(4, 69.3, 'z', 11, 4, 3).map((geometry, index) => {
      // Rotate the four-point ring 45 degrees onto the square mounting pattern.
      geometry.rotateZ(Math.PI / 4);
      geometry.name = `mast-base-fastener-${index + 1}`;
      return geometry;
    })
  ];
  root.add(
    part(
      'ptz-mast-base',
      'Four-hole mast datum base plate',
      {
        partNumber: 'ASR-038-01',
        material: '6061-T6 aluminium, white powder coat',
        process: 'CNC mill, dowel ream and powder coat',
        interfaceNote: 'Four M8 fasteners plus two dowel datums locate mast to the sealed top hardpoint.'
      },
      new THREE.Mesh(basePlate, white),
      new THREE.Mesh(roundedBoxAt(92, 96, 16, 7, -10, 0, 16), whiteTrim),
      merged(baseFasteners, hardware, 'mast-base-fasteners')
    )
  );

  const columnObjects: THREE.Object3D[] = [];
  columnObjects.push(
    new THREE.Mesh(
      roundedBoxAt(70, 76, mastHeight, 7, -10, 0, 14 + mastHeight / 2),
      white
    )
  );
  const rearSpine = new THREE.Mesh(
    roundedBoxAt(28, 94, mastHeight - 12, 5, -38, 0, 14 + mastHeight / 2),
    whiteTrim
  );
  columnObjects.push(rearSpine);
  for (const side of [-1, 1]) {
    const gusset = new THREE.BoxGeometry(92 * MM, 16 * MM, 18 * MM);
    gusset.rotateY(-0.56);
    gusset.translate(-27 * MM, side * 43 * MM, 41 * MM);
    columnObjects.push(new THREE.Mesh(gusset, whiteTrim));
  }
  root.add(
    part(
      'ptz-mast-column',
      'Reinforced calibration mast column',
      {
        partNumber: 'ASR-038-02',
        material: '6061-T6 aluminium weldment, white powder coat',
        process: 'CNC datum faces, fixture weld/bolt and finish machine',
        interfaceNote: 'Column carries a machined top datum; mast must not be used as a lifting point.'
      },
      ...columnObjects
    )
  );

  const swivelZ = mastHeight + 32;
  const swivelGeometries = [
    cylZ(43, 48, 12, -10, 0, mastHeight + 20, 40),
    cylZ(38, 38, 22, -10, 0, swivelZ, 40),
    cylZ(31, 35, 10, -10, 0, mastHeight + 48, 36)
  ];
  root.add(
    part(
      'ptz-pan-adapter',
      'Sealed pan-bearing and camera adapter',
      {
        partNumber: 'ASR-038-03',
        material: 'Anodized aluminium bearing housing with PTFE seal',
        process: 'CNC turning and purchased bearing/seal',
        interfaceNote: 'Bolted to mast top datum; upper flange matches purchased PTZ mounting pattern.'
      },
      merged(swivelGeometries, whiteTrim, 'sealed-pan-adapter')
    )
  );

  const headRadius = num(params, 'headRadiusMm', 74);
  const headCenterZ = mastHeight + 124;
  const headGroup = new THREE.Group();
  const shell = new THREE.SphereGeometry(headRadius * MM, 64, 40);
  shell.scale(0.96, 1, 1.03);
  shell.translate(-10 * MM, 0, headCenterZ * MM);
  headGroup.add(new THREE.Mesh(shell, white));
  headGroup.add(
    new THREE.Mesh(
      cylZ(
        headRadius * 0.6,
        headRadius * 0.68,
        14,
        -10,
        0,
        headCenterZ - headRadius + 5,
        48
      ),
      whiteTrim
    )
  );

  const rearNeck = new THREE.Mesh(
    roundedBoxAt(42, 94, 90, 9, -54, 0, headCenterZ - 31),
    white
  );
  headGroup.add(rearNeck);
  headGroup.add(
    new THREE.Mesh(
      roundedBoxAt(48, 128, 26, 7, -48, 0, headCenterZ - 68),
      whiteTrim
    )
  );
  for (const side of [-1, 1]) {
    headGroup.add(
      new THREE.Mesh(
        roundedBoxAt(42, 18, 94, 6, -43, side * 60, headCenterZ - 27),
        whiteTrim
      ),
      new THREE.Mesh(
        cylY(13, 13, 8, -19, side * 72, headCenterZ + 2, 32),
        whiteTrim
      ),
      new THREE.Mesh(
        cylY(4.2, 4.2, 9, -19, side * 76, headCenterZ + 2, 16),
        hardware
      )
    );
  }

  // Conformal lower-front optical window. The PTZ shell remains fully closed at the top.
  const visor = new THREE.SphereGeometry(
    (headRadius + 0.8) * MM,
    48,
    24,
    Math.PI - 0.78,
    1.56,
    Math.PI * 0.39,
    Math.PI * 0.43
  );
  visor.rotateX(Math.PI / 2);
  visor.translate(-10 * MM, 0, headCenterZ * MM);
  headGroup.add(
    new THREE.Mesh(
      visor,
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#081017'),
        roughness: 0.08,
        metalness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        transparent: false,
        side: THREE.DoubleSide
      })
    )
  );

  const seamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-10 + headRadius * 0.98, 0, headCenterZ + 3).multiplyScalar(MM),
    new THREE.Vector3(-10 + headRadius * 0.94, 0, headCenterZ + 28).multiplyScalar(MM),
    new THREE.Vector3(-10 + headRadius * 0.81, 0, headCenterZ + 55).multiplyScalar(MM),
    new THREE.Vector3(-10 + headRadius * 0.57, 0, headCenterZ + 74).multiplyScalar(MM)
  ]);
  headGroup.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(seamCurve, 24, 0.8 * MM, 6, false),
      dark
    )
  );

  root.add(
    part(
      'ptz-camera-shell',
      'Closed two-piece PTZ environmental housing',
      {
        partNumber: 'ASR-007-REF-SHELL',
        material: 'Purchased UV-stable coated PTZ housing',
        process: 'Purchased camera / fit-check reference',
        printable: false,
        interfaceNote: 'Vendor shell seam and weather seals remain intact; no top vent or air window is modelled.'
      },
      headGroup
    )
  );

  const opticsGroup = new THREE.Group();
  const lensX = headRadius - 12;
  const lensZ = headCenterZ - 18;
  opticsGroup.add(
    new THREE.Mesh(cylX(22, 7, lensX - 3, 0, lensZ, 36), dark),
    new THREE.Mesh(cylX(15, 5, lensX + 1, 0, lensZ, 36), glassMaterial('#122d42', 0.96, 0.02)),
    new THREE.Mesh(cylX(5.5, 4, lensX + 4, 0, lensZ, 28), glassMaterial('#071018', 0.98, 0.01))
  );
  for (const y of [-31, 31]) {
    opticsGroup.add(
      new THREE.Mesh(
        cylX(6.2, 4, lensX + 1, y, lensZ + 2, 20),
        glassMaterial('#20272b', 0.9, 0.02)
      )
    );
  }
  const sideScrews = [
    cylY(3.8, 3.8, 4, -10, headRadius + 1, headCenterZ + 16, 12),
    cylY(3.8, 3.8, 4, -10, -headRadius - 1, headCenterZ + 16, 12),
    cylX(3.5, 4, headRadius - 11, 0, headCenterZ + 44, 12)
  ];
  opticsGroup.add(merged(sideScrews, hardware, 'ptz-shell-fasteners'));
  root.add(
    part(
      'ptz-optical-module',
      'PTZ lens, IR emitters and sealed optical window',
      {
        partNumber: 'ASR-007-REF-OPTICS',
        material: 'Purchased coated optics behind smoked polycarbonate window',
        process: 'Purchased camera / calibration reference',
        printable: false,
        interfaceNote: 'Optical centre defines calibration datum; keep window accessible for cleaning.'
      },
      opticsGroup
    )
  );

  return root;
}

export function buildLidar(
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'lidar:mid360-and-adapter';
  const riserHeight = num(params, 'riserMm', 40);
  const dark = standardMaterial(col(palette, 'base', '#25292e'), 0.5, 0.56);
  const aluminum = standardMaterial(col(palette, 'body', '#c7ccd0'), 0.32, 0.72);
  const hardware = standardMaterial('#aeb5bc', 0.25, 0.9);

  const adapterPlate = plateWithRoundHolesXY(
    84,
    84,
    6,
    [
      { xMm: -31, yMm: -31, radiusMm: 3.4 },
      { xMm: -31, yMm: 31, radiusMm: 3.4 },
      { xMm: 31, yMm: -31, radiusMm: 3.4 },
      { xMm: 31, yMm: 31, radiusMm: 3.4 }
    ],
    3
  );
  const riserObjects = [
    new THREE.Mesh(adapterPlate, dark),
    new THREE.Mesh(roundedBoxAt(72, 72, riserHeight - 6, 6, 0, 0, 6 + (riserHeight - 6) / 2), dark)
  ];
  root.add(
    part(
      'lidar-riser',
      'Livox MID-360 four-hole sealed riser',
      {
        partNumber: 'ASR-039-01',
        material: 'Machined black acetal or 6061-T6 aluminium',
        process: 'CNC machine; printable fit-check prototype',
        interfaceNote: 'Four M6 deck inserts below and vendor-pattern inserts above; cable exits through sealed rear gland.'
      },
      ...riserObjects
    )
  );

  const lowerBody = new THREE.Mesh(
    roundedBoxAt(65, 65, 28, 7, 0, 0, riserHeight + 14),
    aluminum
  );
  const waist = new THREE.Mesh(cylZ(30.5, 30.5, 8, 0, 0, riserHeight + 31, 40), dark);
  root.add(
    part(
      'lidar-body',
      'Livox MID-360 lower housing reference',
      {
        partNumber: 'ASR-004-REF-BODY',
        material: 'Purchased aluminium sensor housing',
        process: 'Purchased component / vendor-envelope reference',
        printable: false,
        interfaceNote: 'Vendor base pattern mounts to adapter; measured base_link transform required after installation.'
      },
      lowerBody,
      waist
    )
  );

  const domeProfile = [
    new THREE.Vector2(27 * MM, 0),
    new THREE.Vector2(27 * MM, 7 * MM),
    new THREE.Vector2(25 * MM, 14 * MM),
    new THREE.Vector2(20 * MM, 21 * MM),
    new THREE.Vector2(12 * MM, 26 * MM),
    new THREE.Vector2(0, 28 * MM)
  ];
  const dome = new THREE.LatheGeometry(domeProfile, 56);
  dome.rotateX(Math.PI / 2);
  dome.translate(0, 0, (riserHeight + 32) * MM);
  root.add(
    part(
      'lidar-optical-dome',
      'Livox MID-360 continuous optical dome reference',
      {
        partNumber: 'ASR-004-REF-DOME',
        material: 'Purchased coated optical polymer',
        process: 'Purchased sensor / non-printable optical reference',
        printable: false,
        interfaceNote: 'One continuous apex-free optical surface preserves the unobstructed 360-degree field of view; no top disk or decorative ring is fitted.'
      },
      new THREE.Mesh(dome, glassMaterial(col(palette, 'window', '#0b2738'), 0.92, 0.04))
    )
  );

  const screwGeometries: THREE.BufferGeometry[] = [];
  for (const x of [-31, 31]) {
    for (const y of [-31, 31]) screwGeometries.push(cylZ(2.6, 2.6, 2.5, x, y, 6.5, 12));
  }
  const connector = new THREE.Mesh(
    roundedBoxAt(12, 20, 12, 2, -31.5, 0, riserHeight + 12),
    dark
  );
  root.add(
    part(
      'lidar-hardware',
      'LiDAR mounting screws and rear connector clearance',
      {
        partNumber: 'ASR-039-HW1',
        material: 'Stainless fasteners and vendor sealed connector',
        process: 'Purchased hardware',
        printable: false,
        interfaceNote: 'Connector requires locking Ethernet/power harness, drip loop and independent strain relief.'
      },
      merged(screwGeometries, hardware, 'lidar-fasteners'),
      connector
    )
  );

  return root;
}

export function buildDepthCamera(
  _params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'depth-camera:d435i-carrier-assembly';
  const aluminum = standardMaterial(col(palette, 'body', '#c9ced3'), 0.3, 0.74);
  const dark = standardMaterial('#111419', 0.46, 0.32);
  const hardware = standardMaterial('#aeb5bc', 0.25, 0.9);

  root.add(
    part(
      'd435i-housing',
      'Intel RealSense D435i housing reference',
      {
        partNumber: 'ASR-005-REF',
        material: 'Purchased aluminium/polymer camera housing',
        process: 'Purchased component / vendor-envelope reference',
        printable: false,
        interfaceNote: 'Rear threaded inserts fasten to compliant carrier; optical face remains behind protective lip.'
      },
      new THREE.Mesh(roundedBoxAt(23, 90, 25, 5, 0, 0, 0), aluminum),
      new THREE.Mesh(roundedBoxAt(5, 84, 20, 2, 10, 0, 0), dark)
    )
  );

  const lensGroup = new THREE.Group();
  const lensSpecs: Array<{ y: number; radius: number; color: string }> = [
    { y: -32, radius: 6.1, color: '#07131d' },
    { y: -10, radius: 5.6, color: '#101b24' },
    { y: 20, radius: 6.2, color: '#07131d' },
    { y: 35, radius: 3.2, color: '#8a2426' }
  ];
  for (const lens of lensSpecs) {
    lensGroup.add(
      new THREE.Mesh(cylX(lens.radius + 1.3, 3, 13, lens.y, 0, 20), dark),
      new THREE.Mesh(cylX(lens.radius, 4, 15, lens.y, 0, 20), glassMaterial(lens.color, 0.94, 0.02))
    );
  }
  root.add(
    part(
      'd435i-optics',
      'Stereo imagers, RGB imager and emitter apertures',
      {
        partNumber: 'ASR-005-REF-OPTICS',
        material: 'Purchased calibrated optical modules',
        process: 'Purchased camera / calibration reference',
        printable: false,
        interfaceNote: 'Do not contact or obstruct optical apertures; calibration datum is the camera housing frame.'
      },
      lensGroup
    )
  );

  const carrierPlate = plateWithRoundHolesXY(
    28,
    86,
    4,
    [
      { xMm: -9, yMm: -34, radiusMm: 2.4 },
      { xMm: -9, yMm: 34, radiusMm: 2.4 },
      { xMm: 9, yMm: -34, radiusMm: 2.4 },
      { xMm: 9, yMm: 34, radiusMm: 2.4 }
    ]
  );
  carrierPlate.rotateY(Math.PI / 2);
  carrierPlate.translate(-13 * MM, 0, 0);
  const earGeometries = [
    roundedBoxAt(10, 10, 28, 2, -15, -40, 0),
    roundedBoxAt(10, 10, 28, 2, -15, 40, 0)
  ];
  root.add(
    part(
      'd435i-carrier',
      'Replaceable front-camera carrier and two mounting ears',
      {
        partNumber: 'ASR-040-01',
        material: 'Black ASA/PA12 prototype or machined acetal production carrier',
        process: 'SLS/FDM prototype; CNC production option',
        interfaceNote: 'Four M4 bezel bosses locate carrier; camera is retained with vendor threaded points and isolating pads.'
      },
      new THREE.Mesh(carrierPlate, dark),
      merged(earGeometries, dark, 'camera-carrier-ears'),
      merged(
        [
          cylX(2.3, 3, -20, -40, 8, 12),
          cylX(2.3, 3, -20, -40, -8, 12),
          cylX(2.3, 3, -20, 40, 8, 12),
          cylX(2.3, 3, -20, 40, -8, 12)
        ],
        hardware,
        'camera-carrier-fasteners'
      )
    )
  );

  return root;
}

export function buildAntenna(
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'antenna:sealed-whip-assembly';
  const whipHeight = num(params, 'whipMm', 190);
  const black = standardMaterial(col(palette, 'body', '#15171a'), 0.68, 0.28);
  const hardware = standardMaterial('#b4a46e', 0.28, 0.84);

  root.add(
    part(
      'antenna-deck-mount',
      'Sealed bulkhead antenna mount and locknut',
      {
        partNumber: 'ASR-042-01',
        material: 'Nickel-plated brass bulkhead with EPDM seal',
        process: 'Purchased RF bulkhead hardware',
        printable: false,
        interfaceNote: 'Through-deck bulkhead requires ground/seal washer and internal coax strain relief.'
      },
      new THREE.Mesh(cylZ(14, 16, 10, 0, 0, 5, 6), hardware),
      new THREE.Mesh(cylZ(12, 12, 8, 0, 0, 14, 24), black)
    )
  );

  const whipGeometries = [
    new THREE.SphereGeometry(8 * MM, 18, 12).translate(0, 0, 21 * MM),
    cylZ(5.2, 7, whipHeight * 0.48, 0, 0, 24 + whipHeight * 0.24, 24),
    cylZ(3.3, 5.2, whipHeight * 0.5, 0, 0, 24 + whipHeight * 0.73, 24),
    new THREE.SphereGeometry(3.8 * MM, 16, 10).translate(0, 0, (26 + whipHeight) * MM)
  ];
  root.add(
    part(
      'antenna-whip',
      'Flexible cellular antenna whip reference',
      {
        partNumber: 'ASR-041-REF',
        material: 'Purchased UV-stable elastomer RF antenna',
        process: 'Purchased antenna / RF envelope reference',
        printable: false,
        interfaceNote: 'SMA/N-type interface and required ground plane depend on final antenna selection.'
      },
      merged(whipGeometries, black, 'tapered-antenna-whip')
    )
  );

  return root;
}
