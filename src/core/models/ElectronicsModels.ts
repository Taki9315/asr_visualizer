import * as THREE from 'three';
import type { ComponentRecord } from '../../types';
import type { ModelPalette, ModelParams } from './ModelKit';
import {
  boxAt,
  col,
  cylX,
  cylZ,
  merged,
  num,
  part,
  plateWithRoundHolesXY,
  roundedBoxAt,
  standardMaterial
} from './ModelKit';
import { MM } from '../units';

function componentPrefix(record: ComponentRecord): string {
  return record.bomRef ?? record.id.toUpperCase();
}

export function buildFinnedBox(
  record: ComponentRecord,
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = `${record.id}:finned-power-electronics`;
  const length = num(params, 'lenMm', 230);
  const width = num(params, 'widMm', 160);
  const height = num(params, 'hMm', 45);
  const prefix = componentPrefix(record);
  const body = standardMaterial(col(palette, 'body', '#9a4d3b'), 0.48, 0.64);
  const fins = standardMaterial(col(palette, 'fins', '#858b91'), 0.36, 0.8);
  const dark = standardMaterial('#1b1e22', 0.58, 0.4);
  const hardware = standardMaterial('#bdc4ca', 0.24, 0.9);

  const basePlate = plateWithRoundHolesXY(
    length + 18,
    width + 18,
    4,
    [
      { xMm: -length / 2 + 9, yMm: -width / 2 - 4, radiusMm: 3.2 },
      { xMm: -length / 2 + 9, yMm: width / 2 + 4, radiusMm: 3.2 },
      { xMm: length / 2 - 9, yMm: -width / 2 - 4, radiusMm: 3.2 },
      { xMm: length / 2 - 9, yMm: width / 2 + 4, radiusMm: 3.2 }
    ],
    -height / 2 + 2
  );
  root.add(
    part(
      `${record.id}-mounting-base`,
      `${record.name} four-point mounting base`,
      {
        partNumber: `${prefix}-MNT`,
        material: '6061-T6 aluminium mounting plate, provisional',
        process: 'Laser/CNC profile, drill and anodize',
        interfaceNote: 'Four M6 isolation points to equipment grid; connector end faces service aisle.'
      },
      new THREE.Mesh(basePlate, fins)
    )
  );

  const caseHeight = height * 0.62;
  root.add(
    part(
      `${record.id}-case`,
      `${record.name} sealed electronics case reference`,
      {
        partNumber: `${prefix}-REF-CASE`,
        material: 'Extruded/cast aluminium vendor enclosure',
        process: 'Purchased module / provisional envelope reference',
        printable: false,
        interfaceNote: 'Case bolts to dedicated mounting plate; final vendor hole pattern remains TBD.'
      },
      new THREE.Mesh(
        roundedBoxAt(length, width, caseHeight, 5, 0, 0, -height / 2 + 4 + caseHeight / 2),
        body
      )
    )
  );

  const finGeometries: THREE.BufferGeometry[] = [];
  const finCount = Math.max(8, Math.floor(width / 11));
  for (let index = 0; index < finCount; index += 1) {
    const y = -width / 2 + 8 + (index * (width - 16)) / (finCount - 1);
    finGeometries.push(boxAt(length - 16, 3.2, height * 0.34, 0, y, height * 0.2));
  }
  finGeometries.push(boxAt(length - 10, width - 10, 3, 0, 0, height * 0.06));
  root.add(
    part(
      `${record.id}-heatsink`,
      `${record.name} integral heatsink fin array`,
      {
        partNumber: `${prefix}-REF-HS`,
        material: 'Anodized aluminium vendor heatsink',
        process: 'Purchased module / thermal-envelope reference',
        printable: false,
        interfaceNote: 'Fin axis maintains specified internal airflow/heat path; do not obstruct service clearance.'
      },
      merged(finGeometries, fins, 'heatsink-fin-array')
    )
  );

  const connectorObjects: THREE.Object3D[] = [];
  connectorObjects.push(
    new THREE.Mesh(
      roundedBoxAt(18, width * 0.72, caseHeight * 0.72, 3, length / 2 + 1, 0, -height * 0.12),
      dark
    )
  );
  for (const y of [-width * 0.27, -width * 0.09, width * 0.09, width * 0.27]) {
    connectorObjects.push(
      new THREE.Mesh(cylX(5.2, 12, length / 2 + 9, y, -height * 0.12, 16), hardware)
    );
  }
  const statusMaterial = standardMaterial('#3ecf6c', 0.35, 0.12, {
    emissive: new THREE.Color('#239c4c'),
    emissiveIntensity: 0.8
  });
  connectorObjects.push(
    new THREE.Mesh(cylX(2.2, 4, length / 2 + 11, width * 0.37, height * 0.04, 12), statusMaterial)
  );
  root.add(
    part(
      `${record.id}-connectors`,
      `${record.name} connector and gland face`,
      {
        partNumber: `${prefix}-REF-IO`,
        material: 'Vendor sealed connectors, glands and terminal cover',
        process: 'Purchased module / harness-interface reference',
        printable: false,
        interfaceNote: 'Keyed connectors require independent cable clamping and branch protection per circuit.'
      },
      ...connectorObjects
    )
  );

  return root;
}

export function buildPdu(
  record: ComponentRecord,
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'pdu:touch-safe-power-distribution';
  const length = num(params, 'lenMm', 220);
  const width = num(params, 'widMm', 160);
  const height = num(params, 'hMm', 70);
  const prefix = componentPrefix(record);
  const caseMaterial = standardMaterial(col(palette, 'body', '#34383e'), 0.52, 0.55);
  const copper = standardMaterial('#a86936', 0.32, 0.9);
  const hardware = standardMaterial('#c0c6cc', 0.24, 0.9);

  const base = plateWithRoundHolesXY(
    length + 16,
    width + 16,
    4,
    [
      { xMm: -length / 2 + 8, yMm: -width / 2 - 3, radiusMm: 3.2 },
      { xMm: -length / 2 + 8, yMm: width / 2 + 3, radiusMm: 3.2 },
      { xMm: length / 2 - 8, yMm: -width / 2 - 3, radiusMm: 3.2 },
      { xMm: length / 2 - 8, yMm: width / 2 + 3, radiusMm: 3.2 }
    ],
    -height / 2 + 2
  );
  root.add(
    part(
      'pdu-base',
      'Power-distribution mounting base',
      {
        partNumber: `${prefix}-01`,
        material: 'Anodized 6061-T6 aluminium',
        process: 'CNC/laser profile and PEM nut install',
        interfaceNote: 'Four M6 chassis-grid points; main-feed end faces battery/service disconnect.'
      },
      new THREE.Mesh(base, caseMaterial)
    )
  );

  root.add(
    part(
      'pdu-enclosure',
      'Touch-safe PDU lower enclosure',
      {
        partNumber: `${prefix}-02`,
        material: 'Flame-retardant PC/ABS or powder-coated aluminium, selection TBD',
        process: 'SLS/FDM prototype; moulded/fabricated production housing',
        interfaceNote: 'Base gasket and retained lid screws isolate all energized distribution hardware.'
      },
      new THREE.Mesh(
        roundedBoxAt(length, width, height * 0.64, 6, 0, 0, -height * 0.16),
        caseMaterial
      )
    )
  );

  const busbarGeometries = [
    boxAt(length * 0.52, 15, 7, 18, 26, height * 0.18),
    boxAt(length * 0.52, 15, 7, 18, -26, height * 0.18)
  ];
  const studGeometries: THREE.BufferGeometry[] = [];
  for (const x of [-26, 12, 50, 88]) {
    studGeometries.push(cylZ(5, 5, 13, x, 26, height * 0.31, 12));
    studGeometries.push(cylZ(5, 5, 13, x, -26, height * 0.31, 12));
  }
  root.add(
    part(
      'pdu-busbars',
      'Positive/negative busbars and protected studs',
      {
        partNumber: `${prefix}-03`,
        material: 'Tin-plated copper busbar and stainless terminal hardware',
        process: 'Waterjet/punch, plate and insulate',
        printable: false,
        interfaceNote: 'Feed studs land after main fuse/contactors; outgoing studs feed individually protected branches.'
      },
      merged(busbarGeometries, copper, 'pdu-busbars'),
      merged(studGeometries, hardware, 'pdu-terminal-studs')
    )
  );

  const fuseGeometries: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 6; index += 1) {
    fuseGeometries.push(roundedBoxAt(18, 12, 18, 2, -70 + index * 27, -58, height * 0.18));
  }
  const disconnect = new THREE.Mesh(
    roundedBoxAt(40, 42, 26, 4, -76, 49, height * 0.2),
    standardMaterial('#c83e38', 0.48, 0.25)
  );
  root.add(
    part(
      'pdu-protection',
      'Branch fuse row and lockable service disconnect reference',
      {
        partNumber: `${prefix}-04`,
        material: 'Purchased touch-safe fuse holders and disconnect',
        process: 'Purchased safety-rated devices',
        printable: false,
        interfaceNote: 'Every motor and DC-DC branch is separately protected; final ratings remain design-dependent.'
      },
      merged(fuseGeometries, standardMaterial('#d99936', 0.48, 0.2), 'branch-fuse-row'),
      disconnect
    )
  );

  const cover = new THREE.Mesh(
    roundedBoxAt(length - 8, width - 8, 5, 3, 0, 0, height / 2 - 2.5),
    standardMaterial('#b9c5ce', 0.2, 0.18, {
      transparent: true,
      opacity: 0.52,
      depthWrite: false
    })
  );
  root.add(
    part(
      'pdu-cover',
      'Clear retained touch-safe PDU cover',
      {
        partNumber: `${prefix}-05`,
        material: 'UL94-V0 clear polycarbonate',
        process: 'CNC prototype / moulded production cover',
        interfaceNote: 'Retained M4 screws and cover-interlock provision; cover removal inhibits autonomous operation.'
      },
      cover,
      merged(
        fastenerCorners(length / 2 - 12, width / 2 - 12, height / 2 + 1),
        hardware,
        'pdu-cover-fasteners'
      )
    )
  );

  return root;
}

function fastenerCorners(halfX: number, halfY: number, z: number): THREE.BufferGeometry[] {
  return [
    cylZ(2.6, 2.6, 3, -halfX, -halfY, z, 12),
    cylZ(2.6, 2.6, 3, -halfX, halfY, z, 12),
    cylZ(2.6, 2.6, 3, halfX, -halfY, z, 12),
    cylZ(2.6, 2.6, 3, halfX, halfY, z, 12)
  ];
}

export function buildBattery(
  record: ComponentRecord,
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'battery:serviceable-pack-reference';
  const length = num(params, 'lenMm', 350);
  const width = num(params, 'widMm', 250);
  const height = num(params, 'hMm', 210);
  const prefix = componentPrefix(record);
  const body = standardMaterial(col(palette, 'body', '#33475e'), 0.58, 0.28);
  const lid = standardMaterial('#26333f', 0.5, 0.4);
  const dark = standardMaterial('#171a1e', 0.72, 0.24);
  const hardware = standardMaterial('#bdc4ca', 0.24, 0.9);

  const ribGeometries: THREE.BufferGeometry[] = [];
  for (const x of [-length * 0.34, -length * 0.17, 0, length * 0.17, length * 0.34]) {
    ribGeometries.push(roundedBoxAt(7, width + 2, height - 34, 2, x, 0, -8));
  }
  root.add(
    part(
      'battery-case',
      '16S LiFePO4 pack enclosure reference',
      {
        partNumber: `${prefix}-REF-CASE`,
        material: 'Powder-coated steel/aluminium vendor pack enclosure, selection TBD',
        process: 'Purchased battery / provisional envelope reference',
        printable: false,
        interfaceNote: 'Pack sits in low cradle with isolation pads; exact vendor case controls production clamp design.'
      },
      new THREE.Mesh(
        roundedBoxAt(length, width, height - 22, 8, 0, 0, -11),
        body
      ),
      merged(ribGeometries, lid, 'battery-case-ribs')
    )
  );

  const lidGeometry = plateWithRoundHolesXY(
    length - 12,
    width - 12,
    16,
    [
      { xMm: -length / 2 + 24, yMm: -width / 2 + 24, radiusMm: 3 },
      { xMm: -length / 2 + 24, yMm: width / 2 - 24, radiusMm: 3 },
      { xMm: length / 2 - 24, yMm: -width / 2 + 24, radiusMm: 3 },
      { xMm: length / 2 - 24, yMm: width / 2 - 24, radiusMm: 3 }
    ],
    height / 2 - 10
  );
  root.add(
    part(
      'battery-lid',
      'Gasketed retained battery service lid reference',
      {
        partNumber: `${prefix}-REF-LID`,
        material: 'Vendor pack lid with sealed BMS service access',
        process: 'Purchased battery / non-user-serviceable reference',
        printable: false,
        interfaceNote: 'Vendor-authorized service only; robot battery extraction does not require opening this lid.'
      },
      new THREE.Mesh(lidGeometry, lid),
      merged(
        fastenerCorners(length / 2 - 24, width / 2 - 24, height / 2),
        hardware,
        'battery-lid-fasteners'
      )
    )
  );

  const positive = new THREE.Mesh(
    cylZ(11, 11, 12, length * 0.31, width * 0.25, height / 2 - 2, 20),
    standardMaterial('#c53d38', 0.38, 0.62)
  );
  const negative = new THREE.Mesh(
    cylZ(11, 11, 12, length * 0.31, -width * 0.25, height / 2 - 2, 20),
    dark
  );
  const serviceDisconnect = new THREE.Mesh(
    roundedBoxAt(52, 34, 24, 4, -length * 0.3, 0, height / 2 - 2),
    standardMaterial('#d66e2b', 0.44, 0.28)
  );
  root.add(
    part(
      'battery-interfaces',
      'Touch-safe pack terminals and service-disconnect reference',
      {
        partNumber: `${prefix}-REF-IO`,
        material: 'Vendor insulated terminals and manual service disconnect',
        process: 'Purchased pack interfaces',
        printable: false,
        interfaceNote: 'Positive terminal feeds close-coupled main fuse; all interfaces require touch-safe boots.'
      },
      positive,
      negative,
      serviceDisconnect
    )
  );

  const handles = new THREE.Group();
  for (const side of [-1, 1]) {
    const handle = new THREE.TorusGeometry(30, 4, 10, 28, Math.PI);
    handle.scale(MM, MM, MM);
    handle.rotateX(Math.PI / 2);
    handle.translate(side * length * 0.34 * MM, 0, (height / 2 - 26) * MM);
    handles.add(new THREE.Mesh(handle, dark));
  }
  root.add(
    part(
      'battery-handles',
      'Two recessed battery extraction handles',
      {
        partNumber: `${prefix}-REF-HDL`,
        material: 'Vendor reinforced elastomer/steel handles',
        process: 'Purchased with battery pack',
        printable: false,
        interfaceNote: 'Handles support pack extraction only; final pack mass and lift method require ergonomic review.'
      },
      handles
    )
  );

  return root;
}

export function buildJetson(
  record: ComponentRecord,
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'jetson:agx-orin-reference-and-carrier';
  const size = num(params, 'sizeMm', 110);
  const height = num(params, 'hMm', 71.65);
  const prefix = componentPrefix(record);
  const dark = standardMaterial(col(palette, 'body', '#171a1e'), 0.5, 0.5);
  const board = standardMaterial('#1e3b2a', 0.54, 0.28);
  const aluminum = standardMaterial(col(palette, 'fins', '#959ca2'), 0.3, 0.82);
  const hardware = standardMaterial('#c2c8ce', 0.22, 0.92);

  const carrier = plateWithRoundHolesXY(
    size + 26,
    size + 26,
    4,
    [
      { xMm: -size / 2 - 4, yMm: -size / 2 - 4, radiusMm: 3.2 },
      { xMm: -size / 2 - 4, yMm: size / 2 + 4, radiusMm: 3.2 },
      { xMm: size / 2 + 4, yMm: -size / 2 - 4, radiusMm: 3.2 },
      { xMm: size / 2 + 4, yMm: size / 2 + 4, radiusMm: 3.2 }
    ],
    -height / 2 + 2
  );
  root.add(
    part(
      'jetson-carrier',
      'Jetson four-point isolation carrier',
      {
        partNumber: `${prefix}-MNT`,
        material: '6061-T6 aluminium carrier with elastomer isolators',
        process: 'CNC profile and anodize',
        interfaceNote: 'Carrier bolts to compute-zone grid; module fasteners use vendor base pattern.'
      },
      new THREE.Mesh(carrier, aluminum)
    )
  );

  root.add(
    part(
      'jetson-module',
      'NVIDIA Jetson AGX Orin developer kit reference',
      {
        partNumber: `${prefix}-REF`,
        material: 'Purchased developer kit electronics',
        process: 'Purchased component / vendor-datasheet envelope',
        printable: false,
        interfaceNote: 'Production rugged compute remains TBD; preserve service clearance and connector access.'
      },
      new THREE.Mesh(roundedBoxAt(size, size, 18, 4, 0, 0, -height / 2 + 11), dark),
      new THREE.Mesh(boxAt(size - 8, size - 8, 5, 0, 0, -height / 2 + 23), board)
    )
  );

  const finGeometries: THREE.BufferGeometry[] = [];
  const finCount = 14;
  for (let index = 0; index < finCount; index += 1) {
    const y = -size / 2 + 8 + (index * (size - 16)) / (finCount - 1);
    finGeometries.push(boxAt(size - 12, 3.4, height * 0.48, 0, y, height * 0.13));
  }
  finGeometries.push(boxAt(size - 6, size - 6, 3, 0, 0, height / 2 - 2));
  root.add(
    part(
      'jetson-heatsink',
      'Jetson heatsink and fin stack reference',
      {
        partNumber: `${prefix}-REF-HS`,
        material: 'Vendor anodized aluminium heatsink',
        process: 'Purchased with compute kit',
        printable: false,
        interfaceNote: 'Fin channel must remain unobstructed and coupled to the verified enclosure thermal path.'
      },
      merged(finGeometries, aluminum, 'jetson-heatsink-fin-stack')
    )
  );

  const portGeometries = [
    roundedBoxAt(10, 28, 13, 2, -size / 2 - 1, -32, -height / 2 + 13),
    roundedBoxAt(10, 19, 13, 2, -size / 2 - 1, -4, -height / 2 + 13),
    roundedBoxAt(10, 22, 13, 2, -size / 2 - 1, 22, -height / 2 + 13),
    roundedBoxAt(10, 12, 13, 2, -size / 2 - 1, 42, -height / 2 + 13)
  ];
  root.add(
    part(
      'jetson-ports',
      'Jetson I/O port-face reference',
      {
        partNumber: `${prefix}-REF-IO`,
        material: 'Purchased shielded board connectors',
        process: 'Purchased module / harness-clearance reference',
        printable: false,
        interfaceNote: 'Locking adapters and connector keep-out volume are required for vehicle service.'
      },
      merged(portGeometries, dark, 'jetson-port-face'),
      merged(
        fastenerCorners(size / 2 - 8, size / 2 - 8, -height / 2 + 25),
        hardware,
        'jetson-module-fasteners'
      )
    )
  );

  return root;
}

export function buildModem(
  record: ComponentRecord,
  params: ModelParams | undefined,
  palette: ModelPalette | undefined
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'modem:rugged-router-reference';
  const length = num(params, 'lenMm', 130);
  const width = num(params, 'widMm', 95);
  const height = num(params, 'hMm', 35);
  const prefix = componentPrefix(record);
  const body = standardMaterial(col(palette, 'body', '#3a3e44'), 0.48, 0.66);
  const dark = standardMaterial('#171a1e', 0.56, 0.42);
  const gold = standardMaterial('#c6a248', 0.28, 0.9);

  const base = plateWithRoundHolesXY(
    length + 18,
    width + 16,
    3.5,
    [
      { xMm: -length / 2 - 3, yMm: -width / 2 - 2, radiusMm: 3 },
      { xMm: -length / 2 - 3, yMm: width / 2 + 2, radiusMm: 3 },
      { xMm: length / 2 + 3, yMm: -width / 2 - 2, radiusMm: 3 },
      { xMm: length / 2 + 3, yMm: width / 2 + 2, radiusMm: 3 }
    ],
    -height / 2 + 1.75
  );
  root.add(
    part(
      'modem-base',
      'Router/modem equipment-grid adapter',
      {
        partNumber: `${prefix}-MNT`,
        material: 'Anodized aluminium adapter plate',
        process: 'Laser/CNC profile',
        interfaceNote: 'Four M5 chassis-grid points; module slots permit final vendor-hole adjustment.'
      },
      new THREE.Mesh(base, body)
    )
  );

  const caseGeometries = [roundedBoxAt(length, width, height - 5, 5, 0, 0, 2.5)];
  const finCount = 8;
  for (let index = 0; index < finCount; index += 1) {
    const y = -width / 2 + 8 + (index * (width - 16)) / (finCount - 1);
    caseGeometries.push(boxAt(length - 14, 3.2, 6, 0, y, height / 2 - 1));
  }
  root.add(
    part(
      'modem-case',
      'Rugged LTE/5G router enclosure reference',
      {
        partNumber: `${prefix}-REF`,
        material: 'Purchased finned aluminium router enclosure',
        process: 'Purchased module / provisional envelope reference',
        printable: false,
        interfaceNote: 'Final router remains TBD; preserve connector face, SIM access and thermal clearance.'
      },
      merged(caseGeometries, body, 'modem-finned-case')
    )
  );

  const connectorGroup = new THREE.Group();
  for (const y of [-width * 0.27, 0, width * 0.27]) {
    connectorGroup.add(
      new THREE.Mesh(cylX(5, 9, -length / 2 - 4, y, 0, 16), gold)
    );
  }
  connectorGroup.add(
    new THREE.Mesh(roundedBoxAt(8, 24, 12, 2, length / 2 + 1, -18, 0), dark),
    new THREE.Mesh(roundedBoxAt(8, 20, 12, 2, length / 2 + 1, 18, 0), dark)
  );
  for (let index = 0; index < 4; index += 1) {
    connectorGroup.add(
      new THREE.Mesh(
        roundedBoxAt(3, 5, 3, 0.6, length / 2 + 5, -18 + index * 8, height * 0.26),
        standardMaterial(index === 0 ? '#42d26b' : '#d5b63c', 0.35, 0.1, {
          emissive: new THREE.Color(index === 0 ? '#249f4a' : '#806c20'),
          emissiveIntensity: 0.65
        })
      )
    );
  }
  root.add(
    part(
      'modem-interfaces',
      'Cellular antenna, Ethernet and power interfaces',
      {
        partNumber: `${prefix}-REF-IO`,
        material: 'Purchased SMA, locking Ethernet and DC connectors',
        process: 'Purchased module / harness-interface reference',
        printable: false,
        interfaceNote: 'Three RF ports route to separated deck antennas; all vehicle harnesses require locking retention.'
      },
      connectorGroup
    )
  );

  return root;
}
