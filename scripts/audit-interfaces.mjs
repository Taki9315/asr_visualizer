import { readFileSync } from 'node:fs';

const componentsDoc = JSON.parse(
  readFileSync(new URL('../src/data/components.json', import.meta.url), 'utf8')
);
const cablesDoc = JSON.parse(
  readFileSync(new URL('../src/data/cables.json', import.meta.url), 'utf8')
);
const vehicleSource = readFileSync(
  new URL('../src/core/models/VehicleModels.ts', import.meta.url),
  'utf8'
);
const sensorSource = readFileSync(
  new URL('../src/core/models/SensorModels.ts', import.meta.url),
  'utf8'
);
const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

const failures = [];
const components = new Map(componentsDoc.components.map((record) => [record.id, record]));
const must = (condition, message) => {
  if (!condition) failures.push(message);
};
const position = (id) => components.get(id)?.placement?.positionMm;
const styledParams = (id) => components.get(id)?.geometry?.styled?.paramsMm ?? {};

for (const id of ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr']) {
  const y = Math.abs(position(id)?.[1] ?? 0);
  must(y >= 350, `${id}: wheel track does not clear the 590 mm shoulder`);
}

const battery = components.get('battery');
const batteryHeight = styledParams('battery').hMm ?? Number.POSITIVE_INFINITY;
const batteryTop = (position('battery')?.[2] ?? 0) + batteryHeight / 2 + 10;
must(batteryHeight <= 175, 'battery: selected packaging envelope is taller than 175 mm');
must(batteryTop <= 295, `battery: interfaces reach ${batteryTop} mm, above the 295 mm cavity limit`);

const pdu = components.get('pdu');
const pduBottom =
  (position('pdu')?.[2] ?? 0) - (pdu?.physical?.envelopeMm?.size?.[2] ?? 0) / 2;
must(pduBottom > 150, `pdu: lower face ${pduBottom} mm intersects the front crossmember crown`);

must(
  JSON.stringify(position('ptz')) === JSON.stringify([-250, 0, 349]),
  'ptz: root does not match the integrated pedestal datum'
);
must(
  JSON.stringify(position('lidar')) === JSON.stringify([285, 105, 326]),
  'lidar: root does not match the sealed LiDAR hardpoint'
);
must(
  JSON.stringify(position('ant-right')) === JSON.stringify([-365, -205, 326]),
  'ant-right: root does not match the single installed antenna hardpoint'
);

const ids = new Set(components.keys());
let maxCableZ = -Infinity;
for (const cable of cablesDoc.cables) {
  must(ids.has(cable.fromId), `${cable.id}: unknown fromId ${cable.fromId}`);
  must(ids.has(cable.toId), `${cable.id}: unknown toId ${cable.toId}`);
  for (const point of cable.pointsMm) maxCableZ = Math.max(maxCableZ, point[2]);
}
must(maxCableZ <= 294, `cables: route rises to ${maxCableZ} mm above the internal harness ceiling`);

must(vehicleSource.includes('hullWallLoft('), 'enclosure: hollow wall loft is not in use');
must(
  !vehicleSource.includes('new THREE.TubeGeometry'),
  'wheel assembly: loose external tube/pigtail geometry is present'
);
must(
  !sensorSource.includes('const topCap'),
  'lidar: obsolete circular top-cap geometry is present'
);
must(
  mainSource.includes("registry.get('ant-left')") &&
    mainSource.includes('optionalDiversityAntenna.userVisible = false'),
  'antenna: optional diversity whip is not default-hidden'
);

if (failures.length > 0) {
  console.error(`Interface audit failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Interface audit passed: ${components.size} components, ${cablesDoc.cables.length} internal routes, max cable Z ${maxCableZ} mm.`
  );
}
