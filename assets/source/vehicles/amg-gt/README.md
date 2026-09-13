# AMG GT asset handoff

Procedural source: `components/game/race/amg-gt.ts`.

The model is a road-going **two-door Mercedes-AMG GT Coupé (C192 / GT 63)**. It has a new front-engine silhouette: long bonnet with two powerdomes, a rearward cabin, broad rear shoulders and a fastback. It does not reuse the ONE shell, roof scoop, dorsal fin or high racing wing.

## Primary references

- [Official Mercedes-AMG GT Coupé](https://www.mercedes-amg.com/en/gt-coupe): elongated bonnet, low greenhouse, wide rear shoulders, deep grille, four exhaust outlets, panoramic roof and sports interior.
- [Mercedes-Benz launch press information](https://media.mercedes-benz.be/de/das-neue-mercedes-amg-gt-coupe-so-amg-made-in-affalterbach/): GT 63 dimensions 4,728 × 1,984 × 1,354 mm, 2,700 mm wheelbase; low fastback, vertical grille, three-element light signature and integrated active rear spoiler. The reference car uses a 4.0-litre V8, 4MATIC+ and MCT 9G. Physics remains the integrating agent's responsibility.

The proportions are an original procedural approximation for the existing game, not factory CAD. Trim, readable lamp elements and faces are slightly enlarged. Geometry was made from scratch; no manufacturer image or downloaded model is embedded.

## Integration

```ts
import { createAmgGt } from './amg-gt';
const model = createAmgGt(kit, color, driverId);
model.update(car, dt, cabinView); // third argument optional; default true
```

Arguments match `createAmgOne(kit, color, driverId)`. The return value contains `root`, `body`, `wheels`, `passengers`, and `update`. Each wheel exposes `root`, `steering` (same group), `roll`, `front`. Local forward is **-Z**. `update` sets X/Z and yaw exactly like the existing cars, leaving the race caller free to apply elevation and root pitch afterwards. The wheelbase is 2.700 units and wheel radius 0.365.

The default paint argument is `#101419` (black). A supplied colour is respected throughout; configure the new vehicle's state to black in the caller to make the selection black by default. This module does not alter vehicle IDs, room protocol, saved state, handling or menu text.

Details include wheel-arch relief; 17 vertical grille bars and three-point emblem; swept headlamp housings/three LEDs; tail signatures; mirrors; one coupe door per side; flush handles and front-fender vent; ten split spokes with metallic edges; drilled rotors, fixed red calipers; four exhaust tips and diffuser; two sports seats with bolsters/stitching; dashboard, vents, instrument display and portrait centre display; steering wheel, arms, seat belt and existing photo-textured driver head.

`cabinView=true` uses very light glass/roof tint, preserving the game's readable faces. `false` gives the glass a stronger road-car tint. The rear lip deploys above 18 game units/s; brake lights brighten on negative throttle. These are visual behaviours only. No frame-time geometry allocations or texture loads occur in `update`.

Static opaque details are merged by material and shadow flags. Glass, the driver's head, wheel assemblies, steering wheel and spoiler retain separate transforms. Geometry/materials/textures stay owned by the supplied `RenderKit`; the existing `kit.dispose()` path applies. Faces use existing `/characters/faces/...` assets through `createRig`; no new image files are needed.

## Validation

- Strict TypeScript check passed (`typecheck.log`), including actual existing RenderKit/CityState types.
- `verification.json`: finite geometry, owned resources, closed manifold body, outward nose/tail normals, positive signed volume, no degenerate shell triangles.
- Four wheel steering/spin transforms, zero-delta wheel freeze, spoiler deployment and correct Nikita face path passed.
- The Nikita variant has **63 meshes / 35,987 triangles** after static merging; other character hairstyles may change this slightly.
- `geometry-preview.png` is a software geometry preview from four angles, inspected for silhouette and interior placement. It is not a screenshot of the live game and does not reproduce Three.js physical lighting exactly.

Geometry validation results accompany this source note. In-scene validation is recorded in docs/acceptance-v0.13.1.md.

## Dimensions and driver clearance invariant

`AMG_GT_DIMENSIONS` exposes the reference body length 4.728, width 1.984, height 1.354, wheelbase 2.700 and wheel radius 0.365. Precise idle geometry bounds (including mirrors, emblem, exhaust trim and roof frame) are **2.2204 wide × 1.3814 high × 4.8384 long**. Tire bottoms are at local Y=0; normal `update` places the root at Y=0.025 before the race renderer applies track elevation. The extra mirror/trim envelope is visual and does not change physics colliders.

`driver-clearance.json` verifies each actual head vertex against raycasts onto the **triangulated roof mesh**, including hair/headwear and maximum animated head roll ±0.108 radians. Every vertex is within the panoramic roof footprint and at least 0.008 game units below its surface. Measured worst-case clearances:

- Nikita: 0.0521 units (5.21 cm at the model scale).
- Yaroslav: 0.0429 units (4.29 cm).
- Roma: 0.0164 units (1.64 cm).

Roma's taller headwear requires a 0.045-unit lower seat position (head Y=1.010 instead of 1.055); all head scales remain 0.95. Roof and heads share the body transform, so car pitch/roll does not invalidate this relative clearance. The final module includes this correction.

Integrated module SHA-256: `fa01bae8ecef543dad73904137ff0bc08c6512f120c617daa3da4f1463975346`.
