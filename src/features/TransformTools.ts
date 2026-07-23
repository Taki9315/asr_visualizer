import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { ComponentEntity } from '../core/ComponentEntity';
import type { CableHandleRef, CableManager } from './CableManager';
import type { AnyCamera, SceneManager } from '../core/SceneManager';

export interface TransformCallbacks {
  onEntityChanged: (entity: ComponentEntity) => void;
  onCableChanged: (ref: CableHandleRef) => void;
  onDraggingChanged: (dragging: boolean) => void;
}

/**
 * Feature 8: gizmo transforms for unlocked components (translate/rotate) and
 * for cable control points (translate only). Snaps: 1 mm translation, 5 deg
 * rotation.
 */
export class TransformManager {
  private readonly tc: TransformControls;
  private attachedEntity: ComponentEntity | null = null;
  private attachedCable: CableHandleRef | null = null;
  /** Set while the gizmo is being dragged so click-selection can be suppressed. */
  dragging = false;
  lastDragEndedAt = 0;

  constructor(
    scene: THREE.Scene,
    sceneManager: SceneManager,
    private readonly cables: CableManager,
    private readonly callbacks: TransformCallbacks
  ) {
    this.tc = new TransformControls(sceneManager.activeCamera, sceneManager.renderer.domElement);
    this.tc.setTranslationSnap(0.001);
    this.tc.setRotationSnap(THREE.MathUtils.degToRad(5));
    this.tc.setSize(0.85);
    scene.add(this.tc.getHelper());

    sceneManager.onCameraChanged((cam: AnyCamera) => {
      this.tc.camera = cam;
    });

    this.tc.addEventListener('dragging-changed', (event) => {
      const value = Boolean((event as unknown as { value: unknown }).value);
      this.dragging = value;
      if (!value) this.lastDragEndedAt = performance.now();
      this.callbacks.onDraggingChanged(value);
    });

    this.tc.addEventListener('objectChange', () => {
      if (this.attachedEntity) {
        this.attachedEntity.setPlacementFromObject();
        this.callbacks.onEntityChanged(this.attachedEntity);
      } else if (this.attachedCable) {
        this.cables.onHandleMoved(this.attachedCable);
        this.callbacks.onCableChanged(this.attachedCable);
      }
    });
  }

  setMode(mode: 'translate' | 'rotate'): void {
    this.tc.setMode(mode);
  }

  attachEntity(entity: ComponentEntity): void {
    this.detach();
    this.attachedEntity = entity;
    this.tc.attach(entity.root);
  }

  attachCableHandle(ref: CableHandleRef): void {
    this.detach();
    const mesh = this.cables.getHandleMesh(ref);
    if (!mesh) return;
    this.attachedCable = ref;
    this.tc.setMode('translate');
    this.tc.attach(mesh);
  }

  detach(): void {
    this.attachedEntity = null;
    this.attachedCable = null;
    this.tc.detach();
  }

  getAttachedEntity(): ComponentEntity | null {
    return this.attachedEntity;
  }
}
