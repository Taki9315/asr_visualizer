# ASR Production-Reference Digital Assembly

Engineering visualization and layout-study application for the Autonomous
Security Robot, companion to ASR-ENG-001 Rev B and the Rev B expanded BOM.

The application uses strict TypeScript, Three.js, and Vite. It preserves a
small dependency footprint while providing detailed mechanical reference
assemblies, named manufacturing subparts, engineering metadata, collision and
service checks, editable cable routes, and CAD handoff hooks.

> Engineering status: Rev B is a design-review baseline, not a manufacturing
> release. Every placement or value marked PROVISIONAL / ASSUMED is a layout
> seed only. Vendor-reference meshes are not a substitute for vendor STEP
> files. Do not release a part for procurement or fabrication from this viewer.

## Run

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Coordinate conventions

- Robot frame: +X forward, +Y left, +Z up (ROS convention).
- Data and exported STL coordinates: millimetres.
- Three.js scene: metres.
- Origin: ground level under the chassis centre.
- Component `parentId` values are logical hierarchy only; all component poses
  remain in the robot world frame.

## Engineering feature map

| Feature | Location |
|---|---|
| Perspective and six orthographic engineering views | Toolbar / `core/SceneManager.ts` |
| Orbit, pan, zoom and fit | Three.js controls |
| Component hierarchy, selection and visibility | Left panel |
| Solid, transparent and hidden enclosure modes | Toolbar |
| Internal layout preset | Toolbar |
| Adjustable exploded view | Right panel |
| Dimensions, mass, power, cooling, service and provenance | Component inspector |
| Move/rotate tools with 1 mm / 5 degree snapping | Toolbar |
| Component AABB collision and red highlighting | `features/CollisionManager.ts` |
| Service and connector keep-out volumes | `keepOuts[]` |
| X/Y/Z section clipping | Right panel |
| Two-point measurement with delta XYZ | Measure tool |
| Battery, compute, power, drive and sensor zones | Zone controls |
| Editable Catmull-Rom cable routes | Cable tool |
| Centre-of-mass estimate | COM control |
| Save/load configuration JSON | Toolbar |
| Local GLB CAD import with mm/m and Y-up/Z-up handling | Inspector |
| Named manufacturing parts and datum-preserving STL export | Inspector |

Keyboard: `S` select, `G` move, `R` rotate, `M` measure, `C` cables,
`F` fit, `Esc` cancel/deselect. Double-click sets the orbit target.

## Production-reference assemblies

The default **MFG** layer preserves the 19 canonical engineering components
while building each component as stable, named local subparts. Fasteners,
panels, brackets and purchased references therefore stay attached to their
component without corrupting COM, cable endpoints, collision rules,
configurations, or exploded-view behavior.

The upgraded model includes:

- A removable lower skid, drilled floor pan, boxed longitudinal rails,
  crossmembers, four replaceable axle/torque plates, battery cradle, four
  structure-cleared equipment trays, and six matched enclosure isolation
  interfaces.
- A hollow, low and wide faceted enclosure with a vertical graphite lower
  tub, outward shoulder break, inward upper slope, angular partial wheel
  covers, joined front and rear fascia returns, rear service door, separate
  bumpers, recessed RealSense through-frame, and a collared perimeter rail.
- Four photo-matched wheel references with rounded pneumatic carcasses,
  mirrored chevron/shoulder tread, large machined annuli, six-lobed hub
  spiders, axle hardware, cable strain relief, and outboard-only
  red/yellow/blue sidewall arcs.
- A deck-integrated PTZ pedestal, positively seated reinforced mast, broad
  rear yoke, sealed pan adapter, closed helmet camera shell, opaque lower
  optical visor, recessed lens/IR module, cap-free Livox MID-360 dome,
  D435i carrier, and one installed antenna hardpoint.
- Named bases, housings, heatsinks, connector faces, covers, terminals,
  disconnects and carriers for compute, battery, PDU, controller, converter,
  and modem packaging.

The large black louvered top-deck "air window" in the concept renders has been
removed completely. The top deck is a single continuous sealed panel with no
slots or grille. Compute and power equipment remain inside sealed bays.

Components can render in three representations:

1. **Named MFG assemblies** (default) - production-style parametric subparts
   with part number, material/process intent, make/buy status and interface
   notes.
2. **Dimensional primitives** (`MFG` off) - the conservative JSON box,
   cylinder and sphere basis.
3. **Imported GLB** - a per-component vendor/released CAD replacement that
   takes precedence over both parametric representations.

## STL and SolidWorks handoff

Select a component and open **Manufacturing reference** in the inspector:

- **Export assembly STL** writes the complete selected component.
- Every named subpart has an individual **STL** export.
- **Export parts manifest** writes part numbers, material/process intent,
  make/buy status, mating-interface notes, local bounds and triangle counts.

STL is unitless. Exported numeric coordinates are deliberately millimetres.
Every subpart preserves the shared component-local datum so separate files
retain their assembly relationship when imported into SolidWorks. A slicer
can use "drop to bed" when preparing one prototype-printable part.

The model audit in `scripts/audit-models.ts` builds every styled component
without a browser and checks:

- The canonical 19-component and cable-endpoint dataset.
- Finite model bounds and nonzero triangle counts.
- Stable, nonduplicated part IDs.
- Closed-edge topology for every part marked prototype-printable.
- Current assembly collisions and service/connector keep-outs.
- Absence of the deleted top air-window geometry.

> Manufacturing boundary: the STL outputs are tessellated engineering
> references, not released feature-history CAD. Purchased parts are marked
> `PURCHASED / REF` and must be replaced by measured or vendor STEP models.
> Every provisional alloy, wall section, fastener, insert, gasket
> compression, tolerance, print orientation, load case and safety interface
> still needs formal engineering verification and drawing release.

## Data model

`src/data/components.json` remains the canonical engineering source. Each
record contains:

- `geometry.primitives`: conservative dimensions.
- `geometry.styled`: production-reference assembly builder and parameters.
- `geometry.glbUrl`, `glbUnits`, `glbUpAxis`: released/vendor CAD hooks.
- `physical`, `power`, `cooling`, `service`: engineering metadata with
  provisional flags and provenance.
- `keepOuts`: service and connector volumes.
- `status`: `vendor-datasheet`, `provisional`, or `assumed`.

`zones.json` defines planning volumes. `cables.json` contains the provisional
harness routes and BOM cable references. Every route is authored below the
sealed deck or terminates at an internal bulkhead; cable tubes are hidden by
default and are exposed only through the cable engineering controls.

`scripts/audit-interfaces.mjs` runs as part of every production build. It
checks wheel track, battery/deck clearance, PDU/crossmember clearance,
sensor-to-hardpoint datums, internal cable height, the single default antenna,
the hollow wall construction, and removal of loose wheel pigtails and the
LiDAR top cap.

Pair collision checks exclude the structural chassis and enclosure because
internal equipment legitimately sits within them. Keep-out intrusion checks
include the structure and use separate local mechanical meshes so sparse
rails, crossmembers and isolators do not create one false union box.

## Replacing a reference with released CAD

1. Keep the SolidWorks/STEP part origin on the component reference datum.
2. Convert the STEP model to GLB for the viewer.
3. Set `glbUnits` to `mm` for a typical CAD export, or `m` for native glTF.
4. Set `glbUpAxis` to `y` for standard glTF, or `z` for a Z-up export.
5. Use **Inspector -> Import GLB**. Placement, selection, clipping, COM,
   collision, explode behavior, and engineering metadata stay intact.
6. **Revert to primitives** restores the parametric reference assembly.

## Verified seeds and unresolved release gates

- Wheel/tyre: nominal 10 x 2.5 in (254 x 63.5 mm). Vendor, inflated envelope,
  axle flat/thread, torque reaction and cable exit remain unverified.
- Jetson AGX Orin developer kit: 110 x 110 x 71.65 mm. It is a prototype
  compute platform, not released production compute.
- Livox MID-360: 65 x 65 x 60 mm, approximately 265 g, four M3 mounting
  holes. The 40 mm custom riser remains provisional.
- Intel RealSense D435i: 90 x 25 x 25 mm, USB-C, one 1/4-20 and two M3
  mounting interfaces. Its weather carrier remains custom.
- Amcrest IP8M-2899EW-AI-V2: 160 mm diameter x 270.5 mm high and 2.60 kg.
  The supplied wall-arm revision must be measured before mast-hole release.
- The Master BOM names Roboteq FBLG2360T (140 x 140 x 25 mm) while the
  References sheet says SBLG2360TS. The viewer uses the Master BOM envelope
  but keeps the selection provisional until that conflict is closed.
- Mean Well SDR-960-48 is bench/dock equipment only and is intentionally not
  represented as an onboard traction supply.

The concept renders are styling references, not mutually consistent
orthographic drawings. Overall released chassis dimensions, motor/axle data,
gross mass/CG, battery packaging, controller selection, safety architecture,
ingress target, and thermal design remain release-gated by ASR-ENG-001 Rev B.

## Known approximations

- Collision uses transformed world-axis-aligned boxes.
- COM treats each canonical component as a point mass at its geometric centre.
- Explode offsets are display-only; collisions and COM use the base layout.
- Transparent enclosure geometry is excluded from picking.
- Cable routes are schematic and are not a cable-schedule length release.
