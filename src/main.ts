import './styles.css';
import * as THREE from 'three';
import componentsJson from './data/components.json';
import zonesJson from './data/zones.json';
import cablesJson from './data/cables.json';
import { validateDataset } from './data/validate';
import { SceneManager } from './core/SceneManager';
import { ComponentRegistry } from './core/Registry';
import type { ComponentEntity } from './core/ComponentEntity';
import { mVecToMm } from './core/units';
import { EnclosureModeManager } from './features/EnclosureModes';
import { CollisionManager } from './features/CollisionManager';
import { ExplodeManager } from './features/ExplodeManager';
import { ClippingManager } from './features/ClippingManager';
import { MeasureTool } from './features/MeasureTool';
import { ZoneManager } from './features/ZoneManager';
import { CableManager } from './features/CableManager';
import { CenterOfMassManager } from './features/CenterOfMass';
import { TransformManager } from './features/TransformTools';
import { applyConfig, buildConfig, downloadConfig, parseConfig } from './features/ConfigIO';
import { setDetailedModels } from './core/ComponentFactory';
import { ModelLoader } from './features/ModelLoader';
import { Toolbar } from './ui/Toolbar';
import { HierarchyPanel } from './ui/HierarchyPanel';
import { InspectorPanel } from './ui/InspectorPanel';
import { StatusBar } from './ui/StatusBar';
import {
  CableSection,
  ClippingSection,
  ComSection,
  ExplodeSection,
  MeasureSection,
  ZoneSection
} from './ui/sections';
import type { Axis, ToolMode, ViewPreset } from './types';

// ---------------------------------------------------------------------------
// Bootstrap: dataset + scene
// ---------------------------------------------------------------------------

const dataset = validateDataset(componentsJson, zonesJson, cablesJson);

function mustGet(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} container`);
  return node;
}

const viewportEl = mustGet('viewport');
const sceneMgr = new SceneManager(viewportEl);
const registry = new ComponentRegistry(dataset.components);
const optionalDiversityAntenna = registry.get('ant-left');
if (optionalDiversityAntenna) {
  optionalDiversityAntenna.userVisible = false;
  optionalDiversityAntenna.applyVisibility();
}
sceneMgr.scene.add(registry.root);

const enclosure = new EnclosureModeManager(registry);
const collisions = new CollisionManager(registry);
const explode = new ExplodeManager(registry);
const zones = new ZoneManager(dataset.zones);
sceneMgr.scene.add(zones.root);
const com = new CenterOfMassManager(registry);
sceneMgr.scene.add(com.marker);
const modelLoader = new ModelLoader();

// The section panels are constructed after the managers; late-bind their
// refresh callbacks so manager constructors can safely emit change events.
let measureSectionRef: MeasureSection | undefined;
let cableSectionRef: CableSection | undefined;

const measure = new MeasureTool(() => measureSectionRef?.refresh());
sceneMgr.scene.add(measure.root);

const cableMgr = new CableManager(dataset.cables, () => cableSectionRef?.refresh());
sceneMgr.scene.add(cableMgr.root);
sceneMgr.scene.add(cableMgr.handlesRoot);

const clipping = new ClippingManager(sceneMgr.scene, () => [
  registry.root,
  zones.root,
  cableMgr.root
]);

sceneMgr.focusBox = registry.overallBaseBox();

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

let toolMode: ToolMode = 'select';
let selected: ComponentEntity | null = null;

const statusBar = new StatusBar(mustGet('status-bar'));

const transform = new TransformManager(sceneMgr.scene, sceneMgr, cableMgr, {
  onEntityChanged: (entity) => afterEntityTransformed(entity),
  onCableChanged: () => cableSection.refresh(),
  onDraggingChanged: (dragging) => {
    sceneMgr.controls.enabled = !dragging;
  }
});

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

const HINTS: Record<ToolMode, string> = {
  select: 'Select: click a component. Double-click focuses the orbit target.',
  translate: 'Move: drag the gizmo (1 mm snap). Locked components cannot be edited.',
  rotate: 'Rotate: drag the gizmo (5° snap). Locked components cannot be edited.',
  measure: 'Measure: click two points on geometry to read the distance.',
  'cable-edit': 'Cables: click a control point, drag its gizmo; insert/delete points in the Cable routes section.'
};

function refreshCollisions(): void {
  const report = collisions.update();
  statusBar.setCollisions(report);
  hierarchy.render(selected?.id ?? null);
}

function refreshCom(): void {
  comSection.update(com.refresh());
}

// Panel DOM rebuilds are coalesced to one per animation frame so gizmo drags
// (which fire objectChange per pointermove) stay smooth.
let uiRefreshQueued = false;
function scheduleUiRefresh(): void {
  if (uiRefreshQueued) return;
  uiRefreshQueued = true;
  requestAnimationFrame(() => {
    uiRefreshQueued = false;
    refreshCollisions();
    refreshCom();
    if (selected) inspector.render(selected);
  });
}

function afterEntityTransformed(_entity: ComponentEntity): void {
  scheduleUiRefresh();
}

/** Assembly envelope for view framing, widened while the view is exploded. */
function currentFocusBox(): THREE.Box3 {
  const box = registry.overallBaseBox();
  if (explode.isExploded()) box.expandByScalar(explode.getFactor() * 0.5 * 1.7);
  return box;
}

function canAttach(entity: ComponentEntity): boolean {
  return (
    !entity.record.locked &&
    entity.effectiveVisible() &&
    !explode.isExploded() &&
    (toolMode === 'translate' || toolMode === 'rotate')
  );
}

function select(entity: ComponentEntity | null): void {
  if (selected && selected !== entity) {
    selected.selected = false;
    selected.refreshHighlight();
  }
  selected = entity;
  if (entity) {
    entity.selected = true;
    entity.refreshHighlight();
    statusBar.setSelected(`${entity.record.name} (${entity.id})`);
    if (canAttach(entity)) {
      transform.setMode(toolMode === 'rotate' ? 'rotate' : 'translate');
      transform.attachEntity(entity);
    } else if (toolMode === 'translate' || toolMode === 'rotate') {
      transform.detach();
      if (entity.record.locked) statusBar.setHint('Component is locked — unlock it in the inspector to edit.');
      else if (!entity.effectiveVisible()) statusBar.setHint('Component is hidden — show it to edit its placement.');
      else if (explode.isExploded()) statusBar.setHint('Reset the explode slider to 0 to edit placements.');
    }
  } else {
    statusBar.setSelected('');
    if (toolMode === 'translate' || toolMode === 'rotate') transform.detach();
  }
  inspector.render(entity);
  hierarchy.render(entity?.id ?? null);
}

function setToolMode(mode: ToolMode): void {
  if (toolMode === 'measure' && mode !== 'measure') measure.cancelPending();
  toolMode = mode;
  toolbar.setActiveTool(mode);
  if (mode === 'cable-edit') {
    cableMgr.root.visible = true;
    toolbar.setToggle('cables', true);
  }
  cableMgr.setEditMode(mode === 'cable-edit');
  statusBar.setHint(HINTS[mode]);

  if (mode === 'translate' || mode === 'rotate') {
    if (selected && canAttach(selected)) {
      transform.setMode(mode === 'rotate' ? 'rotate' : 'translate');
      transform.attachEntity(selected);
    } else {
      transform.detach();
    }
  } else {
    transform.detach();
  }
  cableSection.refresh();
}

const toolbar = new Toolbar(mustGet('toolbar'), {
  onView: (view: ViewPreset) => {
    sceneMgr.focusBox = currentFocusBox();
    sceneMgr.setView(view);
    toolbar.setActiveView(view);
  },
  onFit: () => {
    sceneMgr.focusBox = currentFocusBox();
    sceneMgr.fitView();
  },
  onInternalLayout: () => {
    enclosure.setMode('hidden');
    toolbar.setEnclosureMode('hidden');
    zones.setAllVisible(true);
    toolbar.setToggle('zones', true);
    registry.setKeepOutsVisible(true);
    toolbar.setToggle('keepouts', true);
    sceneMgr.setView('perspective');
    toolbar.setActiveView('perspective');
    refreshCollisions();
    statusBar.setHint('Internal layout view: enclosure hidden, zones and keep-outs shown.');
  },
  onEnclosureMode: (mode) => {
    enclosure.setMode(mode);
    toolbar.setEnclosureMode(mode);
    refreshCollisions();
  },
  onToolMode: setToolMode,
  onToggleZones: (on) => zones.setAllVisible(on),
  onToggleKeepOuts: (on) => registry.setKeepOutsVisible(on),
  onToggleCables: (on) => {
    cableMgr.root.visible = on;
    if (!on && toolMode === 'cable-edit') {
      setToolMode('select');
      statusBar.setHint('Cable display turned off — left the Cables tool.');
    }
  },
  onToggleCom: (on) => {
    com.setVisible(on);
    if (on) refreshCom();
  },
  onToggleDetail: (on) => {
    setDetailedModels(on);
    for (const entity of registry.entities) {
      if (!entity.usingGlb) entity.rebuildPrimitives();
    }
    clipping.rebuild();
    refreshCollisions();
    refreshCom();
    if (selected) inspector.render(selected);
    statusBar.setHint(
      on
        ? 'Named production-reference assemblies enabled. Custom prototype parts export as datum-preserving mm STL; verify every provisional dimension.'
        : 'Simple primitive models — the documented dimensional basis.'
    );
  },
  onSave: () => {
    downloadConfig(buildConfig(registry, cableMgr, enclosure.getMode(), explode.getFactor()));
    statusBar.setHint('Configuration downloaded as JSON.');
  },
  onLoadFile: (file) => {
    file
      .text()
      .then((text) => {
        const config = parseConfig(text);
        const { unknownIds } = applyConfig(config, registry, cableMgr);
        enclosure.setMode(config.enclosureMode);
        toolbar.setEnclosureMode(config.enclosureMode);
        explode.setFactor(config.explodeFactor);
        explodeSection.set(config.explodeFactor);
        transform.detach();
        select(null);
        refreshCollisions();
        refreshCom();
        clipping.rebuild();
        statusBar.setHint(
          unknownIds.length > 0
            ? `Configuration loaded; unknown component ids ignored: ${unknownIds.join(', ')}`
            : 'Configuration loaded.'
        );
      })
      .catch((err: unknown) => {
        statusBar.setHint(`Config load failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  }
});

const hierarchy = new HierarchyPanel(mustGet('left-panel'), registry, {
  onSelect: (id) => {
    const entity = registry.get(id);
    if (entity) select(entity);
  },
  onToggleVisibility: (id) => {
    const entity = registry.get(id);
    if (!entity) return;
    entity.userVisible = !entity.userVisible;
    entity.applyVisibility();
    if (!entity.effectiveVisible() && selected === entity) transform.detach();
    refreshCollisions();
  }
});

const rightPanel = mustGet('right-panel');
const inspectorHost = document.createElement('div');
rightPanel.append(inspectorHost);
const inspector = new InspectorPanel(inspectorHost, {
  onToggleLock: (id) => {
    const entity = registry.get(id);
    if (!entity) return;
    entity.record.locked = !entity.record.locked;
    if (entity.record.locked && transform.getAttachedEntity() === entity) transform.detach();
    else if (selected === entity && canAttach(entity)) {
      transform.setMode(toolMode === 'rotate' ? 'rotate' : 'translate');
      transform.attachEntity(entity);
    }
    inspector.render(entity);
    hierarchy.render(selected?.id ?? null);
  },
  onImportGlb: (id, file) => {
    const entity = registry.get(id);
    if (!entity) return;
    statusBar.setHint(`Importing ${file.name}…`);
    modelLoader
      .importGlbFile(entity, file)
      .then(() => {
        clipping.rebuild();
        refreshCollisions();
        refreshCom();
        inspector.render(entity);
        statusBar.setHint(
          `GLB imported for ${entity.record.name} (interpreted as ${entity.record.geometry.glbUnits}). Metadata unchanged.`
        );
      })
      .catch((err: unknown) => {
        statusBar.setHint(`GLB import failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  },
  onRevertGlb: (id) => {
    const entity = registry.get(id);
    if (!entity) return;
    modelLoader.revertToPrimitives(entity);
    clipping.rebuild();
    refreshCollisions();
    refreshCom();
    inspector.render(entity);
    statusBar.setHint(`${entity.record.name} reverted to parametric primitives.`);
  },
  onGlbUnitsChanged: (id, units) => {
    const entity = registry.get(id);
    if (!entity) return;
    entity.record.geometry.glbUnits = units;
    modelLoader.applyGlbConventions(entity);
    refreshCollisions();
    refreshCom();
    inspector.render(entity === selected ? entity : selected);
    statusBar.setHint(
      entity.usingGlb
        ? `GLB rescaled to ${units} for ${entity.record.name}.`
        : `GLB unit convention for ${entity.record.name} set to ${units} (applies at import).`
    );
  },
  onGlbUpAxisChanged: (id, upAxis) => {
    const entity = registry.get(id);
    if (!entity) return;
    entity.record.geometry.glbUpAxis = upAxis;
    modelLoader.applyGlbConventions(entity);
    refreshCollisions();
    refreshCom();
    inspector.render(entity === selected ? entity : selected);
    statusBar.setHint(
      entity.usingGlb
        ? `GLB up-axis reapplied (${upAxis === 'y' ? 'Y-up rotated into Z-up' : 'Z-up as-authored'}).`
        : `GLB up-axis convention for ${entity.record.name} set to ${upAxis} (applies at import).`
    );
  }
});

const explodeSection = new ExplodeSection(rightPanel, (factor) => {
  explode.setFactor(factor);
  if (explode.isExploded()) {
    transform.detach();
  } else if (selected && canAttach(selected)) {
    transform.setMode(toolMode === 'rotate' ? 'rotate' : 'translate');
    transform.attachEntity(selected);
  }
});

const box = registry.overallBaseBox();
const minMm = mVecToMm(box.min);
const maxMm = mVecToMm(box.max);
const margin = 30;
const clipRanges: Record<Axis, [number, number]> = {
  x: [minMm[0] - margin, maxMm[0] + margin],
  y: [minMm[1] - margin, maxMm[1] + margin],
  z: [minMm[2] - margin, maxMm[2] + margin]
};
const clippingSection = new ClippingSection(rightPanel, clipping, clipRanges, () => {
  clipping.rebuild();
});
void clippingSection;

const comSection = new ComSection(rightPanel);
const zoneSection = new ZoneSection(rightPanel, zones);
void zoneSection;
const measureSection = new MeasureSection(rightPanel, measure);
measureSectionRef = measureSection;
const cableSection = new CableSection(rightPanel, cableMgr, {
  onInsertPoint: () => {
    const ref = cableMgr.insertAfterSelected();
    if (ref) {
      transform.attachCableHandle(ref);
      statusBar.setHint('Control point inserted.');
    } else {
      statusBar.setHint('Select a cable control point first (Cables tool).');
    }
  },
  onDeletePoint: () => {
    if (cableMgr.deleteSelected()) {
      transform.detach();
      statusBar.setHint('Control point deleted.');
    } else {
      statusBar.setHint('Cannot delete — select a point first; routes keep at least 2 points.');
    }
  }
});
cableSectionRef = cableSection;

// ---------------------------------------------------------------------------
// Viewport picking
// ---------------------------------------------------------------------------

const canvas = sceneMgr.renderer.domElement;
let downX = 0;
let downY = 0;

canvas.addEventListener('pointerdown', (ev) => {
  downX = ev.clientX;
  downY = ev.clientY;
});

canvas.addEventListener('click', (ev) => {
  const moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
  if (moved > 5) return; // orbit drag, not a click
  if (transform.dragging || performance.now() - transform.lastDragEndedAt < 200) return;

  if (toolMode === 'measure') {
    if (explode.isExploded()) {
      statusBar.setHint(
        'Measurements are disabled while exploded — offsets are display-only. Reset the explode slider to 0.'
      );
      return;
    }
    const hit = SceneManager.filterHits(sceneMgr.pick(ev, [registry.root]), (p) =>
      clipping.isPointVisible(p)
    );
    if (hit) {
      const state = measure.addPoint(hit.point);
      statusBar.setHint(
        state === 'first' ? 'First point set — click the second point.' : 'Measurement added.'
      );
    }
    return;
  }

  if (toolMode === 'cable-edit') {
    const handleHit = SceneManager.filterHits(sceneMgr.pick(ev, cableMgr.getHandleMeshes()));
    if (handleHit) {
      const cableId = handleHit.object.userData['cableId'] as string | undefined;
      const index = handleHit.object.userData['pointIndex'] as number | undefined;
      if (cableId !== undefined && index !== undefined) {
        const ref = { cableId, index };
        cableMgr.setSelectedHandle(ref);
        transform.attachCableHandle(ref);
      }
    }
    return;
  }

  // select / translate / rotate
  const hit = SceneManager.filterHits(sceneMgr.pick(ev, [registry.root]), (p) =>
    clipping.isPointVisible(p)
  );
  if (!hit) {
    select(null);
    return;
  }
  let obj: THREE.Object3D | null = hit.object;
  let componentId: string | undefined;
  while (obj) {
    const id = obj.userData['componentId'] as string | undefined;
    if (id !== undefined) {
      componentId = id;
      break;
    }
    obj = obj.parent;
  }
  const entity = componentId !== undefined ? registry.get(componentId) : undefined;
  select(entity ?? null);
});

canvas.addEventListener('dblclick', (ev) => {
  const hit = SceneManager.filterHits(sceneMgr.pick(ev, [registry.root]), (p) =>
    clipping.isPointVisible(p)
  );
  if (hit) {
    sceneMgr.controls.target.copy(hit.point);
    sceneMgr.controls.update();
  }
});

window.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const target = ev.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
    return;
  }
  switch (ev.key.toLowerCase()) {
    case 'escape':
      measure.cancelPending();
      cableMgr.setSelectedHandle(null);
      transform.detach();
      select(null);
      break;
    case 's':
      setToolMode('select');
      break;
    case 'g':
      setToolMode('translate');
      break;
    case 'r':
      setToolMode('rotate');
      break;
    case 'm':
      setToolMode('measure');
      break;
    case 'c':
      setToolMode('cable-edit');
      break;
    case 'f':
      sceneMgr.focusBox = currentFocusBox();
      sceneMgr.fitView();
      break;
    default:
      break;
  }
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

toolbar.setEnclosureMode('solid');
toolbar.setActiveTool('select');
sceneMgr.setView('perspective');
toolbar.setActiveView('perspective');
hierarchy.render(null);
inspector.render(null);
refreshCollisions();
refreshCom();
statusBar.setHint(
  `${dataset.components.length} components loaded. ${dataset.disclaimer}`
);
sceneMgr.start();

// Dataset-linked released/vendor CAD loads after the parametric assembly is
// interactive. A failed optional GLB never prevents the engineering reference
// model from loading.
const linkedCadEntities = registry.entities.filter((entity) => entity.record.geometry.glbUrl);
if (linkedCadEntities.length > 0) {
  void Promise.allSettled(
    linkedCadEntities.map(async (entity) => {
      const url = entity.record.geometry.glbUrl;
      if (!url) return;
      await modelLoader.importGlbUrl(entity, url);
    })
  ).then((results) => {
    const loaded = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - loaded;
    clipping.rebuild();
    refreshCollisions();
    refreshCom();
    statusBar.setHint(
      failed > 0
        ? `${loaded} linked CAD model(s) loaded; ${failed} failed and remain on parametric references.`
        : `${loaded} linked CAD model(s) loaded.`
    );
  });
}
