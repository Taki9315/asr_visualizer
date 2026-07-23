import * as THREE from 'three';
import type { ComponentRecord, StyledModelSpec } from '../types';
import {
  buildBattery,
  buildFinnedBox,
  buildJetson,
  buildModem,
  buildPdu
} from './models/ElectronicsModels';
import {
  buildAntenna,
  buildDepthCamera,
  buildLidar,
  buildPtz
} from './models/SensorModels';
import {
  buildBodyShell,
  buildChassisFrame,
  buildWheel
} from './models/VehicleModels';

/**
 * Production-oriented parametric assembly router.
 *
 * The 19 canonical ComponentRecords remain the dimensional, collision, COM,
 * cable and configuration contract. Each builder returns a local assembly of
 * named mechanical subparts carrying manufacturing metadata and mm-based STL
 * export coordinates. Purchased hardware remains clearly marked as reference
 * geometry rather than being misrepresented as released fabrication CAD.
 */
export function buildStyledModel(record: ComponentRecord): THREE.Group | null {
  const spec: StyledModelSpec | undefined = record.geometry.styled;
  if (!spec) return null;
  const params = spec.paramsMm;
  const palette = spec.palette;

  switch (spec.kind) {
    case 'chassisFrame':
      return buildChassisFrame(params, palette);
    case 'wheel':
      return buildWheel(record.id, params, palette);
    case 'bodyShell':
      return buildBodyShell(params, palette);
    case 'ptz':
      return buildPtz(params, palette);
    case 'lidar':
      return buildLidar(params, palette);
    case 'depthCamera':
      return buildDepthCamera(params, palette);
    case 'antenna':
      return buildAntenna(params, palette);
    case 'finnedBox':
      return buildFinnedBox(record, params, palette);
    case 'pdu':
      return buildPdu(record, params, palette);
    case 'battery':
      return buildBattery(record, params, palette);
    case 'jetson':
      return buildJetson(record, params, palette);
    case 'modem':
      return buildModem(record, params, palette);
  }
}
