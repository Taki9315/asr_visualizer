import type { ComponentEntity } from '../core/ComponentEntity';
import type { ProvisionalNumber } from '../types';
import { formatVecMm } from '../core/units';
import {
  exportComponentStl,
  exportManufacturingManifest,
  exportManufacturingPartStl,
  listManufacturingParts
} from '../features/ManufacturingExport';
import { badge, button, el, statusBadge } from './dom';

export interface InspectorCallbacks {
  onToggleLock: (id: string) => void;
  onImportGlb: (id: string, file: File) => void;
  onRevertGlb: (id: string) => void;
  onGlbUnitsChanged: (id: string, units: 'm' | 'mm') => void;
  onGlbUpAxisChanged: (id: string, upAxis: 'z' | 'y') => void;
}

function provValue(pn: ProvisionalNumber, unit: string): HTMLElement {
  const span = el('span', 'value');
  span.append(`${pn.value} ${unit} `);
  if (pn.provisional) {
    const b = badge('PROVISIONAL', 'prov');
    if (pn.source) b.title = pn.source;
    span.append(b);
  } else if (pn.source) {
    const b = badge('SOURCE', 'info');
    b.title = pn.source;
    span.append(b);
  }
  return span;
}

/**
 * Feature 7: component inspector — dimensions, mass, power, cooling and
 * service data, with provisional provenance made explicit.
 */
export class InspectorPanel {
  private readonly rootEl: HTMLElement;

  constructor(container: HTMLElement, private readonly cb: InspectorCallbacks) {
    container.append(el('h2', 'panel-title', 'Component inspector'));
    this.rootEl = el('div', 'inspector-body');
    container.append(this.rootEl);
  }

  private row(label: string, content: HTMLElement | string): HTMLElement {
    const r = el('div', 'i-row');
    r.append(el('span', 'i-label', label));
    if (typeof content === 'string') r.append(el('span', 'value', content));
    else r.append(content);
    return r;
  }

  render(entity: ComponentEntity | null): void {
    this.rootEl.textContent = '';
    if (!entity) {
      this.rootEl.append(el('div', 'panel-hint', 'No component selected. Click a component in the viewport or the hierarchy.'));
      return;
    }
    const rec = entity.record;
    const manufacturingParts = listManufacturingParts(entity);

    const head = el('div', 'i-head');
    const title = el('div', 'i-name', rec.name);
    head.append(title);
    const badges = el('div', 'i-badges');
    badges.append(statusBadge(rec.status));
    if (rec.bomRef) badges.append(badge(rec.bomRef, 'info'));
    badges.append(badge(rec.category.toUpperCase(), 'info'));
    if (rec.locked) badges.append(badge('LOCKED', 'assumed'));
    head.append(badges);
    this.rootEl.append(head);

    this.rootEl.append(el('div', 'i-desc', rec.description));

    const sec = (t: string): HTMLElement => {
      const h = el('h3', 'i-section', t);
      this.rootEl.append(h);
      return h;
    };

    sec('Placement (editable)');
    this.rootEl.append(this.row('Position', formatVecMm(entity.basePositionMm)));
    this.rootEl.append(
      this.row('Rotation', `[${entity.baseRotationDeg.map((d) => d.toFixed(1)).join(', ')}] °`)
    );
    const lockBtn = button(
      rec.locked ? 'Unlock placement' : 'Lock placement',
      'i-btn',
      () => this.cb.onToggleLock(rec.id)
    );
    this.rootEl.append(lockBtn);

    sec('Dimensions');
    const envRow = el('span', 'value');
    envRow.append(formatVecMm(rec.physical.envelopeMm.size), ' ');
    if (rec.physical.envelopeMm.provisional) envRow.append(badge('PROVISIONAL', 'prov'));
    this.rootEl.append(this.row('Declared envelope', envRow));
    this.rootEl.append(this.row('Modelled size', formatVecMm(entity.getLocalSizeMm())));

    sec('Mass');
    this.rootEl.append(this.row('Mass', provValue(rec.physical.massKg, 'kg')));

    sec('Power');
    this.rootEl.append(this.row('Voltage', rec.power.voltage));
    this.rootEl.append(this.row('Typical', provValue(rec.power.typicalW, 'W')));
    this.rootEl.append(this.row('Peak', provValue(rec.power.peakW, 'W')));

    sec('Cooling');
    const coolVal = el('span', 'value');
    coolVal.append(rec.cooling.method, ' ');
    if (rec.cooling.provisional) coolVal.append(badge('PROVISIONAL', 'prov'));
    this.rootEl.append(this.row('Method', coolVal));
    if (rec.cooling.notes) this.rootEl.append(this.row('Notes', rec.cooling.notes));

    sec('Service');
    this.rootEl.append(this.row('Access', rec.service.access));
    this.rootEl.append(this.row('Interval', rec.service.interval));
    if (rec.service.notes) this.rootEl.append(this.row('Notes', rec.service.notes));

    if (rec.keepOuts.length > 0) {
      sec('Keep-out volumes');
      for (const ko of rec.keepOuts) {
        const v = el('span', 'value');
        v.append(`${ko.label} — ${formatVecMm(ko.sizeMm)} `);
        if (ko.provisional) v.append(badge('PROVISIONAL', 'prov'));
        this.rootEl.append(
          this.row(ko.kind === 'service-clearance' ? 'Service' : 'Connector', v)
        );
      }
    }

    sec('Geometry representation');
    this.rootEl.append(
      this.row(
        'Active model',
        entity.usingGlb
          ? 'Imported GLB'
          : manufacturingParts.length > 0
            ? `Named production-reference assembly (${manufacturingParts.length} parts)`
            : `Parametric primitives (${rec.geometry.primitives.length})`
      )
    );

    const glbRow = el('div', 'i-glb-row');
    const unitsSel = el('select', 'i-select');
    for (const u of ['mm', 'm'] as const) {
      const opt = el('option', undefined, u === 'mm' ? 'GLB units: mm (CAD export)' : 'GLB units: m (glTF standard)');
      opt.value = u;
      unitsSel.append(opt);
    }
    unitsSel.value = rec.geometry.glbUnits;
    unitsSel.addEventListener('change', () => {
      this.cb.onGlbUnitsChanged(rec.id, unitsSel.value === 'mm' ? 'mm' : 'm');
    });
    glbRow.append(unitsSel);

    const upSel = el('select', 'i-select');
    for (const [value, label] of [
      ['z', 'GLB up-axis: Z (as-authored)'],
      ['y', 'GLB up-axis: Y (glTF standard)']
    ] as const) {
      const opt = el('option', undefined, label);
      opt.value = value;
      upSel.append(opt);
    }
    upSel.value = rec.geometry.glbUpAxis;
    upSel.addEventListener('change', () => {
      this.cb.onGlbUpAxisChanged(rec.id, upSel.value === 'y' ? 'y' : 'z');
    });
    glbRow.append(upSel);

    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.glb,model/gltf-binary';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.cb.onImportGlb(rec.id, file);
      fileInput.value = '';
    });
    glbRow.append(fileInput);
    glbRow.append(button('Import GLB…', 'i-btn', () => fileInput.click()));
    if (entity.usingGlb) {
      glbRow.append(button('Revert to primitives', 'i-btn', () => this.cb.onRevertGlb(rec.id)));
    }
    this.rootEl.append(glbRow);

    if (manufacturingParts.length > 0) {
      sec('Manufacturing reference');
      this.rootEl.append(
        el(
          'div',
          'i-desc i-source',
          'STL coordinates are emitted in millimetres and preserve the shared component datum. PROVISIONAL and purchased reference geometry still requires vendor CAD, tolerances, structural review and drawing release before manufacture.'
        )
      );
      const exportRow = el('div', 'i-glb-row');
      exportRow.append(
        button('Export assembly STL', 'i-btn', () => exportComponentStl(entity)),
        button('Export parts manifest', 'i-btn', () =>
          exportManufacturingManifest(entity, manufacturingParts)
        )
      );
      this.rootEl.append(exportRow);

      const summary = el('div', 'mfg-summary');
      const printableCount = manufacturingParts.filter((part) => part.meta.printable).length;
      summary.append(
        badge(`${manufacturingParts.length} NAMED PARTS`, 'info'),
        badge(`${printableCount} PROTOTYPE-PRINTABLE`, printableCount > 0 ? 'vendor' : 'assumed')
      );
      this.rootEl.append(summary);

      const partList = el('div', 'mfg-parts');
      for (const manufacturingPart of manufacturingParts) {
        const partRow = el('div', 'mfg-part');
        const copy = el('div', 'mfg-part-copy');
        const heading = el('div', 'mfg-part-heading');
        heading.append(
          el('span', 'mfg-part-name', manufacturingPart.meta.label),
          badge(manufacturingPart.meta.partNumber, 'info'),
          badge(
            manufacturingPart.meta.printable ? 'PROTOTYPE PRINT' : 'PURCHASED / REF',
            manufacturingPart.meta.printable ? 'vendor' : 'assumed'
          )
        );
        copy.append(
          heading,
          el(
            'div',
            'mfg-part-detail',
            `${manufacturingPart.meta.material} · ${manufacturingPart.meta.process}`
          ),
          el('div', 'mfg-part-interface', manufacturingPart.meta.interfaceNote),
          el(
            'div',
            'mfg-part-stats',
            `${formatVecMm(manufacturingPart.sizeMm)} · ${manufacturingPart.triangles.toLocaleString()} triangles`
          )
        );
        const exportButton = button('STL', 'i-btn i-btn-small', () =>
          exportManufacturingPartStl(entity, manufacturingPart)
        );
        exportButton.title = `Export ${manufacturingPart.meta.partNumber} in the shared component datum (millimetres)`;
        partRow.append(copy, exportButton);
        partList.append(partRow);
      }
      this.rootEl.append(partList);
    }

    sec('Data provenance');
    this.rootEl.append(el('div', 'i-desc i-source', rec.sourceNote));
  }
}
