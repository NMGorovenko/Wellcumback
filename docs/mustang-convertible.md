# Mustang S550 convertible

The procedural Mustang uses the supplied [front](../references/vehicles/mustang/front.jpg) and [rear](../references/vehicles/mustang/rear.jpg) photographs for the bonnet, heat extractors, swept headlights, honeycomb grille and pony, split-spoke wheels, rear light panel and triple red blades. The photographs show a fastback; the requested convertible is an intentional conversion, with no roof, rear pillars or rear glass.

The open cabin has four seats, a separate windshield frame, lowered windows, a short folded-roof well, dashboard/instruments, steering wheel, hands, belts and visible original photo faces. City seats contain Nikita, Yaroslav and Roma, in the same speech-anchor order; race mode contains the chosen driver. The actual `createRig` head groups and their photo UVs are retained.

All painted surfaces share the selected colour; the default remains red `#c52236`. Body length 4.18, width 1.84, wheelbase 2.57 and tire radius 0.405 preserve the city car footprint. Full visible bounds including mirrors and trim are approximately 2.117 × 4.322; these are not replacement collision dimensions. Heads deliberately keep the game's large, recognizable proportions.

`tests/mustang-model.test.mjs` checks the closed outward shell, finite geometry, no collapsed triangles, original head/photo contracts, city and three race driver configurations, geometry/material ownership and disposal, footprint, selected paint, wheel motion, fixed calipers and transformed speech anchors. Head bounds clear the actual rigid cabin triangles at ±0.11 rad roll; head vertices remain at least 0.1167 units behind the windshield plane. Overhead ray probes confirm that the cabin remains open.

Static detail is merged by material. Rendered complexity is 77 meshes / 59,720 triangles for three city occupants and 61–65 meshes / 41,448–44,568 triangles for one race driver. The original face rigs account for part of that difference.

The geometric preview is a depth-buffered software projection with original face textures. It validates shape and occlusion; physical materials, lighting, postprocessing and runtime performance still require inspection in the integrated game renderer. The car is a stylized game asset, not a manufacturer-accurate CAD or simulation model.
