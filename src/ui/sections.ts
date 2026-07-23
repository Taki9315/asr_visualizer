import type { Axis } from '../types';
import type { ClippingManager } from '../features/ClippingManager';
import type { MeasureTool } from '../features/MeasureTool';
import type { CableManager } from '../features/CableManager';
import type { ZoneManager } from '../features/ZoneManager';
import type { ComResult } from '../features/CenterOfMass';
import { button, el } from './dom';

function section(container: HTMLElement, title: string): HTMLElement {
  const wrap = el('details', 'section');
  (wrap as HTMLDetailsElement).open = true;
  const summary = el('summary', 'section-title', title);
  wrap.append(summary);
  const body = el('div', 'section-body');
  wrap.append(body);
  container.append(wrap);
  return body;
}

/** Feature 6 UI: explode slider with mm readout. */
export class ExplodeSection {
  private readonly slider: HTMLInputElement;
  private readonly readout: HTMLElement;

  constructor(container: HTMLElement, onChange: (factor: number) => void) {
    const body = section(container, 'Exploded view');
    this.slider = el('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.value = '0';
    this.readout = el('span', 'value', '0 mm');
    const row = el('div', 'ctl-row');
    row.append(this.slider, this.readout);
    body.append(row);
    body.append(
      el('div', 'panel-hint', 'Display offset only — collisions and COM use the base layout. Component editing is disabled while exploded.')
    );
    this.slider.addEventListener('input', () => {
      const f = Number(this.slider.value) / 100;
      this.readout.textContent = `${Math.round(f * 500)} mm`;
      onChange(f);
    });
  }

  set(factor: number): void {
    this.slider.value = String(Math.round(factor * 100));
    this.readout.textContent = `${Math.round(factor * 500)} mm`;
  }
}

/** Feature 12 UI: per-axis section clipping. */
export class ClippingSection {
  constructor(
    container: HTMLElement,
    clipping: ClippingManager,
    rangesMm: Record<Axis, [number, number]>,
    onChanged: () => void
  ) {
    const body = section(container, 'Section clipping');
    for (const axis of ['x', 'y', 'z'] as const) {
      const range = rangesMm[axis];
      const row = el('div', 'ctl-row');
      const check = el('input');
      check.type = 'checkbox';
      check.title = `Enable ${axis.toUpperCase()} clipping`;
      const label = el('span', 'ctl-axis', axis.toUpperCase());
      const slider = el('input');
      slider.type = 'range';
      slider.min = String(range[0]);
      slider.max = String(range[1]);
      slider.step = '5';
      slider.value = String(Math.round((range[0] + range[1]) / 2));
      const readout = el('span', 'value', `${slider.value} mm`);
      const flip = button('⇄', 'i-btn i-btn-small', () => {
        clipping.flip(axis);
        onChanged();
      });
      flip.title = 'Flip clip side';

      check.addEventListener('change', () => {
        clipping.setOffsetMm(axis, Number(slider.value));
        clipping.setEnabled(axis, check.checked);
        onChanged();
      });
      slider.addEventListener('input', () => {
        readout.textContent = `${slider.value} mm`;
        clipping.setOffsetMm(axis, Number(slider.value));
        onChanged();
      });

      row.append(check, label, slider, readout, flip);
      body.append(row);
    }
  }
}

/** Feature 16 UI: centre-of-mass readout. */
export class ComSection {
  private readonly readout: HTMLElement;

  constructor(container: HTMLElement) {
    const body = section(container, 'Centre of mass');
    this.readout = el('div', 'com-readout', '—');
    body.append(this.readout);
    body.append(
      el(
        'div',
        'panel-hint',
        'Σ(m·p)/Σm over component geometric centres, hidden components included. Approximation — per-component COM offsets are not modelled.'
      )
    );
  }

  update(result: ComResult): void {
    if (!result.comMm) {
      this.readout.textContent = 'No mass data.';
      return;
    }
    const [x, y, z] = result.comMm;
    this.readout.innerHTML = '';
    this.readout.append(
      el('div', undefined, `COM: [${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}] mm`),
      el('div', undefined, `Total mass: ${result.totalKg.toFixed(2)} kg`),
      el(
        'div',
        'panel-hint',
        `${result.provisionalMassCount} of ${result.componentCount} component masses are provisional`
      )
    );
  }
}

/** Feature 13 UI: measurement list. */
export class MeasureSection {
  private readonly listEl: HTMLElement;

  constructor(container: HTMLElement, private readonly measure: MeasureTool) {
    const body = section(container, 'Measurements');
    this.listEl = el('div', 'measure-list');
    body.append(this.listEl);
    body.append(button('Clear all', 'i-btn', () => this.measure.clearAll()));
    this.refresh();
  }

  refresh(): void {
    this.listEl.textContent = '';
    const items = this.measure.list();
    if (items.length === 0) {
      this.listEl.append(el('div', 'panel-hint', 'Use the Measure tool: click two points in the viewport.'));
      return;
    }
    for (const m of items) {
      const row = el('div', 'measure-row');
      row.append(
        el(
          'span',
          'value',
          `#${m.id}  ${m.distanceMm.toFixed(1)} mm  (ΔX ${m.deltaMm[0].toFixed(0)} · ΔY ${m.deltaMm[1].toFixed(0)} · ΔZ ${m.deltaMm[2].toFixed(0)})`
        )
      );
      row.append(button('✕', 'i-btn i-btn-small', () => this.measure.remove(m.id)));
      this.listEl.append(row);
    }
  }
}

/** Feature 14 UI: zone list with individual visibility. */
export class ZoneSection {
  constructor(container: HTMLElement, zones: ZoneManager) {
    const body = section(container, 'Zones');
    for (const zone of zones.zones) {
      const row = el('div', 'ctl-row');
      const check = el('input');
      check.type = 'checkbox';
      check.checked = true;
      check.addEventListener('change', () => zones.setZoneVisible(zone.id, check.checked));
      const swatch = el('span', 'zone-swatch');
      swatch.style.background = zone.colorHex;
      const label = el('span', 'value', zone.label);
      label.title = zone.description;
      row.append(check, swatch, label);
      body.append(row);
    }
    body.append(
      el('div', 'panel-hint', 'Master zone visibility is the "Zones" toolbar toggle; checkboxes filter individual zones.')
    );
  }
}

export interface CableSectionCallbacks {
  onInsertPoint: () => void;
  onDeletePoint: () => void;
}

/** Feature 15 UI: cable route list and control-point editing. */
export class CableSection {
  private readonly listEl: HTMLElement;
  private readonly selEl: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly cables: CableManager,
    cb: CableSectionCallbacks
  ) {
    const body = section(container, 'Cable routes');
    this.listEl = el('div', 'cable-list');
    body.append(this.listEl);
    this.selEl = el('div', 'panel-hint', 'No control point selected.');
    body.append(this.selEl);
    const row = el('div', 'ctl-row');
    row.append(
      button('Insert point after', 'i-btn', cb.onInsertPoint),
      button('Delete point', 'i-btn', cb.onDeletePoint)
    );
    body.append(row);
    body.append(
      el(
        'div',
        'panel-hint',
        'Switch to the Cables tool, click a control point, then drag its gizmo. Routes are provisional — final harness lengths come from the cable schedule.'
      )
    );
    this.refresh();
  }

  refresh(): void {
    this.listEl.textContent = '';
    for (const route of this.cables.list()) {
      const row = el('div', 'cable-row');
      const swatch = el('span', 'zone-swatch');
      swatch.style.background = route.colorHex;
      row.append(swatch);
      const label = el('span', 'value', `${route.label} (${route.pointsMm.length} pts)`);
      label.title = route.bomRef ? `BOM ${route.bomRef}` : route.id;
      row.append(label);
      this.listEl.append(row);
    }
    const sel = this.cables.selectedHandle;
    if (sel) {
      const route = this.cables.get(sel.cableId);
      this.selEl.textContent = route
        ? `Selected: ${route.label} — point ${sel.index + 1} of ${route.pointsMm.length}`
        : 'No control point selected.';
    } else {
      this.selEl.textContent = 'No control point selected.';
    }
  }
}
