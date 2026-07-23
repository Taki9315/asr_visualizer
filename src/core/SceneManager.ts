import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CSS2DRenderer
} from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ViewPreset } from '../types';

export type AnyCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/**
 * Renderer, cameras, orbit controls and standard engineering views.
 * World frame: +X forward, +Y left, +Z up (robot convention).
 */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly cssRenderer: CSS2DRenderer;
  readonly container: HTMLElement;

  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  activeCamera: AnyCamera;
  controls: OrbitControls;
  currentView: ViewPreset = 'perspective';

  /** Assembly envelope used for view framing; set by main once entities exist. */
  focusBox = new THREE.Box3(new THREE.Vector3(-0.6, -0.5, 0), new THREE.Vector3(0.6, 0.5, 0.9));

  private orthoHalfH = 0.8;
  private readonly raycaster = new THREE.Raycaster();
  private readonly cameraListeners: Array<(cam: AnyCamera) => void> = [];
  private readonly frameListeners: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0xf4f5f5);
    // Neutral studio environment for PBR reflections on metals/plastics.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.82;
    container.appendChild(this.renderer.domElement);

    this.cssRenderer = new CSS2DRenderer();
    this.cssRenderer.domElement.style.position = 'absolute';
    this.cssRenderer.domElement.style.top = '0';
    this.cssRenderer.domElement.style.left = '0';
    this.cssRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.cssRenderer.domElement);

    this.persp = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.activeCamera = this.persp;

    this.buildEnvironment();

    this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildEnvironment(): void {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3, 72),
      new THREE.MeshStandardMaterial({
        color: 0xebeceb,
        roughness: 1,
        metalness: 0
      })
    );
    floor.position.z = -0.0015;
    floor.receiveShadow = true;
    floor.userData['pickIgnore'] = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(6, 60, 0xc7ccd0, 0xd9dde0);
    grid.rotation.x = Math.PI / 2; // default grid lies in XZ; move it to the XY ground plane
    grid.position.z = -0.001;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.26;
    }
    grid.userData['pickIgnore'] = true;
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(0.4);
    axes.position.set(0, 0, 0.002);
    axes.visible = false;
    axes.userData['pickIgnore'] = true;
    this.scene.add(axes);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xaeb4ba, 1);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.15);
    key.position.set(2.7, 2.1, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.8;
    key.shadow.camera.right = 1.8;
    key.shadow.camera.top = 1.8;
    key.shadow.camera.bottom = -1.8;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 10;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xe8edf2, 0.82);
    fill.position.set(-2.4, -2.8, 1.8);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.42);
    rim.position.set(-2.3, 2.8, 2.5);
    this.scene.add(rim);

    // Ground shadow catcher (the grid stays for reference).
    const catcher = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    );
    catcher.position.z = -0.0004;
    catcher.receiveShadow = true;
    catcher.userData['pickIgnore'] = true;
    this.scene.add(catcher);
  }

  onCameraChanged(fn: (cam: AnyCamera) => void): void {
    this.cameraListeners.push(fn);
  }

  onFrame(fn: () => void): void {
    this.frameListeners.push(fn);
  }

  private swapControls(camera: AnyCamera, target: THREE.Vector3): void {
    this.controls.dispose();
    this.activeCamera = camera;
    this.controls = new OrbitControls(camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.target.copy(target);
    this.controls.update();
    for (const fn of this.cameraListeners) fn(camera);
  }

  setView(view: ViewPreset): void {
    this.currentView = view;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    this.focusBox.getCenter(center);
    this.focusBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.2);
    const dist = maxDim * 2.1;

    if (view === 'perspective') {
      this.persp.up.set(0, 0, 1);
      this.persp.position.set(
        center.x + maxDim * 1.55,
        center.y - maxDim * 1.25,
        center.z + maxDim * 1.05
      );
      this.swapControls(this.persp, center);
      return;
    }

    this.orthoHalfH = maxDim * 0.68;
    this.ortho.zoom = 1;
    switch (view) {
      case 'top':
        this.ortho.up.set(1, 0, 0); // robot front points up on screen
        this.ortho.position.set(center.x, center.y, center.z + dist);
        break;
      case 'front':
        this.ortho.up.set(0, 0, 1);
        this.ortho.position.set(center.x + dist, center.y, center.z);
        break;
      case 'rear':
        this.ortho.up.set(0, 0, 1);
        this.ortho.position.set(center.x - dist, center.y, center.z);
        break;
      case 'left':
        this.ortho.up.set(0, 0, 1);
        this.ortho.position.set(center.x, center.y + dist, center.z);
        break;
      case 'right':
        this.ortho.up.set(0, 0, 1);
        this.ortho.position.set(center.x, center.y - dist, center.z);
        break;
    }
    this.updateOrthoFrustum();
    this.swapControls(this.ortho, center);
  }

  fitView(): void {
    this.setView(this.currentView);
  }

  private updateOrthoFrustum(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    this.ortho.left = -this.orthoHalfH * aspect;
    this.ortho.right = this.orthoHalfH * aspect;
    this.ortho.top = this.orthoHalfH;
    this.ortho.bottom = -this.orthoHalfH;
    this.ortho.updateProjectionMatrix();
  }

  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.cssRenderer.setSize(w, h);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrthoFrustum();
  }

  start(): void {
    const loop = (): void => {
      requestAnimationFrame(loop);
      this.controls.update();
      for (const fn of this.frameListeners) fn();
      this.renderer.render(this.scene, this.activeCamera);
      this.cssRenderer.render(this.scene, this.activeCamera);
    };
    loop();
  }

  /** Raycast from a pointer event against the given roots (recursive). */
  pick(ev: { clientX: number; clientY: number }, roots: THREE.Object3D[]): THREE.Intersection[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.activeCamera);
    return this.raycaster.intersectObjects(roots, true);
  }

  /**
   * First hit that is fully visible, not flagged pickIgnore, and (optionally)
   * not clipped away by active section planes.
   */
  static filterHits(
    hits: THREE.Intersection[],
    isPointVisible?: (p: THREE.Vector3) => boolean
  ): THREE.Intersection | null {
    for (const hit of hits) {
      if (isPointVisible && !isPointVisible(hit.point)) continue;
      let obj: THREE.Object3D | null = hit.object;
      let ok = true;
      while (obj) {
        if (!obj.visible || obj.userData['pickIgnore'] === true) {
          ok = false;
          break;
        }
        obj = obj.parent;
      }
      if (ok) return hit;
    }
    return null;
  }
}
