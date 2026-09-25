# Road response in 0.21

The car samples the selected physical road along its actual travel vector over
a 2.4 m wheelbase. Curvature times planar speed squared gives the vertical
acceleration required to follow the road. The chassis suspension absorbs short
curvature changes; a sustained convex crest releases the wheels once extension
is exhausted. This works while descending and drifting as well as climbing.
Takeoff keeps the vertical velocity earned on the previous actual contact step,
with no extra jump impulse. A height sample on another layer (for example the
river bed just behind a bank) cannot invent road curvature or a launch tangent.
Actual ledges still trigger the existing collision/fall handling on arrival.

While supported, that same road acceleration drives a damped chassis spring.
Landings compress this spring once and its rebound decays naturally. There is
no periodic bump function or elapsed-time noise. Travel is bounded to 16 cm of
compression and 12 cm of extension. Flat roads and a stationary car settle to
zero. Wheel contact height and body suspension travel remain separate.

`flight.suspension.offset` is the signed chassis displacement in metres;
`velocity` is its relative velocity. Render the offset on the chassis relative
to the planted wheels, replacing the former sine vibration and separate
`flight.landing * 0.15` root offset. It should not move collision surfaces or
be added to `car.elevation`. `presentedVehicle` interpolates this nested offset
on the same clock as the car and camera, without changing authoritative state.

Both spring state variables are optional and serialized inside `flight`.
Old snapshots initialize them to rest. The peer parser validates and copies
the pair; no wire-version change is required. City stepping stays at 60 Hz and
races retain their 120 Hz simulation. This remains an arcade vertical-contact
model, without independent wheel masses, chassis roll dynamics or tyre damage.

Focused regression: `node --experimental-strip-types --test tests/city-suspension.test.mjs`.
Route and high-speed coverage: `node --experimental-strip-types --test tests/city-spawn-surface.test.mjs tests/city-speed.test.mjs tests/race-city-course.test.mjs`.
