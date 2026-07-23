import type { EnclosureMode, ToolMode, ViewPreset } from '../types';
import { button, el } from './dom';

export interface ToolbarCallbacks {
  onView: (view: ViewPreset) => void;
  onFit: () => void;
  onInternalLayout: () => void;
  onEnclosureMode: (mode: EnclosureMode) => void;
  onToolMode: (mode: ToolMode) => void;
  onToggleZones: (on: boolean) => void;
  onToggleKeepOuts: (on: boolean) => void;
  onToggleCables: (on: boolean) => void;
  onToggleCom: (on: boolean) => void;
  onToggleDetail: (on: boolean) => void;
  onSave: () => void;
  onLoadFile: (file: File) => void;
}

const VIEWS: Array<{ view: ViewPreset; label: string }> = [
  { view: 'perspective', label: 'Persp' },
  { view: 'top', label: 'Top' },
  { view: 'front', label: 'Front' },
  { view: 'rear', label: 'Rear' },
  { view: 'left', label: 'Left' },
  { view: 'right', label: 'Right' }
];

const TOOLS: Array<{ mode: ToolMode; label: string; title: string }> = [
  { mode: 'select', label: 'Select', title: 'Select components (S)' },
  { mode: 'translate', label: 'Move', title: 'Move unlocked components (G)' },
  { mode: 'rotate', label: 'Rotate', title: 'Rotate unlocked components (R)' },
  { mode: 'measure', label: 'Measure', title: 'Two-click distance measurement (M)' },
  { mode: 'cable-edit', label: 'Cables', title: 'Edit cable route control points (C)' }
];

export class Toolbar {
  private readonly viewButtons = new Map<ViewPreset, HTMLButtonElement>();
  private readonly toolButtons = new Map<ToolMode, HTMLButtonElement>();
  private readonly encButtons = new Map<EnclosureMode, HTMLButtonElement>();
  private readonly toggleButtons = new Map<string, HTMLButtonElement>();

  constructor(container: HTMLElement, cb: ToolbarCallbacks) {
    const brand = el('div', 'brand');
    brand.append(
      el('span', 'brand-title', 'ASR Digital Assembly'),
      el('span', 'brand-sub', 'Rev B · production reference')
    );
    container.append(brand);

    const viewGroup = el('div', 'tb-group');
    viewGroup.append(el('span', 'tb-label', 'View'));
    for (const { view, label } of VIEWS) {
      const b = button(label, 'tb-btn', () => cb.onView(view));
      this.viewButtons.set(view, b);
      viewGroup.append(b);
    }
    viewGroup.append(button('Fit', 'tb-btn', () => cb.onFit()));
    container.append(viewGroup);

    const encGroup = el('div', 'tb-group');
    encGroup.append(el('span', 'tb-label', 'Enclosure'));
    for (const mode of ['solid', 'transparent', 'hidden'] as const) {
      const b = button(mode[0]!.toUpperCase() + mode.slice(1), 'tb-btn', () => cb.onEnclosureMode(mode));
      this.encButtons.set(mode, b);
      encGroup.append(b);
    }
    encGroup.append(
      button('Internal layout', 'tb-btn tb-accent', () => cb.onInternalLayout())
    );
    container.append(encGroup);

    const toolGroup = el('div', 'tb-group');
    toolGroup.append(el('span', 'tb-label', 'Tool'));
    for (const { mode, label, title } of TOOLS) {
      const b = button(label, 'tb-btn', () => cb.onToolMode(mode));
      b.title = title;
      this.toolButtons.set(mode, b);
      toolGroup.append(b);
    }
    container.append(toolGroup);

    const showGroup = el('div', 'tb-group');
    showGroup.append(el('span', 'tb-label', 'Show'));
    const mkToggle = (key: string, label: string, fn: (on: boolean) => void, initial = false): void => {
      const b = button(label, 'tb-btn tb-toggle', () => {
        const on = !b.classList.contains('active');
        b.classList.toggle('active', on);
        fn(on);
      });
      if (initial) b.classList.add('active');
      this.toggleButtons.set(key, b);
      showGroup.append(b);
    };
    mkToggle('zones', 'Zones', cb.onToggleZones);
    mkToggle('keepouts', 'Keep-outs', cb.onToggleKeepOuts);
    mkToggle('cables', 'Cables', cb.onToggleCables);
    mkToggle('com', 'COM', cb.onToggleCom);
    const hd = this.toggleButtons;
    mkToggle('detail', 'MFG', cb.onToggleDetail, true);
    hd.get('detail')!.title = 'Toggle named production-reference assemblies vs dimensional primitives';
    container.append(showGroup);

    const fileGroup = el('div', 'tb-group tb-right');
    fileGroup.append(button('Save config', 'tb-btn', () => cb.onSave()));
    const loadInput = el('input');
    loadInput.type = 'file';
    loadInput.accept = 'application/json,.json';
    loadInput.style.display = 'none';
    loadInput.addEventListener('change', () => {
      const file = loadInput.files?.[0];
      if (file) cb.onLoadFile(file);
      loadInput.value = '';
    });
    fileGroup.append(
      button('Load config', 'tb-btn', () => loadInput.click()),
      loadInput
    );
    container.append(fileGroup);
  }

  setActiveView(view: ViewPreset): void {
    for (const [v, b] of this.viewButtons) b.classList.toggle('active', v === view);
  }

  setActiveTool(mode: ToolMode): void {
    for (const [m, b] of this.toolButtons) b.classList.toggle('active', m === mode);
  }

  setEnclosureMode(mode: EnclosureMode): void {
    for (const [m, b] of this.encButtons) b.classList.toggle('active', m === mode);
  }

  setToggle(key: 'zones' | 'keepouts' | 'cables' | 'com' | 'detail', on: boolean): void {
    this.toggleButtons.get(key)?.classList.toggle('active', on);
  }
}
