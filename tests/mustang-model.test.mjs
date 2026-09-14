import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createMustang, mustangBodyGeometry } from "../components/game/city/mustang.ts";
import { RenderKit } from "../components/game/world/render-kit.ts";

const idle = {
  x: 0,
  z: 0,
  heading: 0,
  steering: 0,
  vx: 0,
  vz: 0,
  speed: 0,
  throttle: 0,
  elapsed: 0,
  drifting: false,
};

function fixture(options) {
  const kit = new RenderKit(new THREE.Scene()),
    textures = [];
  // Geometry tests keep the real rig and face UVs but need no DOM image loader.
  kit.texture = (url) => {
    textures.push(url);
    const texture = new THREE.Texture();
    kit.textures.add(texture);
    return texture;
  };
  const car = createMustang(kit, options);
  car.update(idle, 0, false);
  car.root.updateMatrixWorld(true);
  return { kit, car, textures };
}

function triangle(geometry, offset, matrix = new THREE.Matrix4()) {
  return new THREE.Triangle(
    ...[0, 1, 2].map((k) =>
      new THREE.Vector3()
        .fromBufferAttribute(
          geometry.attributes.position,
          geometry.index ? geometry.index.getX(offset + k) : offset + k,
        )
        .applyMatrix4(matrix),
    ),
  );
}

function triangleCount(geometry) {
  return (geometry.index?.count ?? geometry.attributes.position.count) / 3;
}

void test("Mustang shell is finite, closed and outward, without collapsed triangles", () => {
  const geometry = mustangBodyGeometry();
  try {
    geometry.computeBoundingBox();
    const p = geometry.attributes.position,
      index = geometry.index;
    const edges = new Map();
    let volume = 0,
      front = 0,
      rear = 0;
    assert(index);
    for (const attribute of Object.values(geometry.attributes))
      assert([...attribute.array].every(Number.isFinite));
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const tri = triangle(geometry, i),
        normal = tri.getNormal(new THREE.Vector3());
      assert(tri.getArea() > 1e-10, `collapsed shell triangle ${i / 3}`);
      volume += tri.a.dot(tri.b.clone().cross(tri.c)) / 6;
      if (ids.every((id) => Math.abs(p.getZ(id) - geometry.boundingBox.min.z) < 1e-6)) {
        assert(normal.z < -0.99, "front cap must face forward");
        front++;
      }
      if (ids.every((id) => Math.abs(p.getZ(id) - geometry.boundingBox.max.z) < 1e-6)) {
        assert(normal.z > 0.99, "rear cap must face backward");
        rear++;
      }
      for (let edge = 0; edge < 3; edge++) {
        const key = [ids[edge], ids[(edge + 1) % 3]].sort((a, b) => a - b).join(":");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert(volume > 0, "outward winding gives positive signed volume");
    assert(front > 0 && rear > 0);
    assert(
      [...edges.values()].every((count) => count === 2),
      "every edge has exactly two triangles",
    );
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert(size.x <= 1.85 && size.z <= 4.2, "shell must fit the existing city car footprint");
  } finally {
    geometry.dispose();
  }
});

for (const driverId of [undefined, "nikita", "yaroslav", "roma"]) {
  void test(`Mustang ${driverId ?? "city crew"} preserves faces, seated clearance and resource ownership`, () => {
    const { kit, car, textures } = fixture({ driverId, color: "#316a91" });
    try {
      const expected = driverId ? [driverId] : ["nikita", "yaroslav", "roma"];
      assert.deepEqual(
        car.passengers.map((head) => head.name),
        expected.map((id) => `passenger-${id}`),
      );
      assert.deepEqual(
        textures,
        expected.map((id) => `/characters/faces/${id}.${id === "roma" ? "png" : "jpg"}`),
      );
      assert.equal(car.wheels.length, 4);
      assert.equal(car.wheels.filter((wheel) => wheel.front).length, 2);
      let meshes = 0,
        triangles = 0,
        paintMeshes = 0,
        faceMeshes = 0;
      car.root.traverse((object) => {
        if (!object.isMesh) return;
        meshes++;
        triangles += triangleCount(object.geometry);
        for (const attribute of Object.values(object.geometry.attributes))
          assert(
            [...attribute.array].every(Number.isFinite),
            `${object.name}: non-finite geometry`,
          );
        assert(kit.geometries.has(object.geometry), "RenderKit must own every geometry");
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          assert(kit.materials.has(material), "RenderKit must own every material");
          if (material.name === "mustang-paint") {
            assert.equal(material.color.getHexString(), "316a91");
            paintMeshes++;
          }
          if (material.map) {
            assert(object.geometry.attributes.uv, "photo surfaces must retain their original UVs");
            faceMeshes++;
          }
        }
      });
      assert(paintMeshes > 0);
      assert.equal(faceMeshes, expected.length);
      assert(meshes < 110 && triangles < 80000, "tiny static details must remain batched");
      const size = new THREE.Box3().setFromObject(car.root).getSize(new THREE.Vector3());
      assert(
        size.x < 2.15 && size.z < 4.37 && size.y < 1.8,
        "visual car must fit existing streets and cameras",
      );

      const windscreen = car.root.getObjectByName("mustang-windscreen");
      assert(windscreen?.isMesh);
      const pane = triangle(windscreen.geometry, 0, windscreen.matrixWorld);
      const plane = new THREE.Plane().setFromCoplanarPoints(pane.a, pane.b, pane.c);
      assert(plane.normal.z < 0, "the windshield faces the local front");
      // The neck and shirt intentionally touch the head. All rigid body/interior
      // surfaces are tested using conservative head boxes against actual triangles.
      const rigidNames = new Set([
        "mustang-paint",
        "mustang-black-trim",
        "mustang-machined-metal",
        "mustang-dark-metal",
        "mustang-leather",
        "mustang-seat-inserts",
      ]);
      const rigid = car.body.children.filter((o) => o.isMesh && rigidNames.has(o.material.name));
      assert(rigid.some((o) => o.material.name === "mustang-leather"));
      assert(rigid.some((o) => o.material.name === "mustang-paint"));
      const rigidTriangles = rigid.flatMap((mesh) =>
        Array.from({ length: triangleCount(mesh.geometry) }, (_, i) =>
          triangle(mesh.geometry, i * 3, mesh.matrixWorld),
        ),
      );
      for (const roll of [-0.11, 0, 0.11]) {
        car.passengers.forEach((head) => {
          head.rotation.z = roll;
        });
        car.root.updateMatrixWorld(true);
        const boxes = car.passengers.map((head) => new THREE.Box3().setFromObject(head));
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++)
            assert(!boxes[i].intersectsBox(boxes[j]), "seated heads must not intersect");
          assert(
            !rigidTriangles.some((tri) => boxes[i].intersectsTriangle(tri)),
            `${car.passengers[i].name} must clear the rigid cabin at roll ${roll}`,
          );
        }
        for (const head of car.passengers) {
          assert.equal(head.parent, car.body, "speech uses actual heads attached to the body");
          head.traverse((object) => {
            if (!object.isMesh) return;
            const position = object.geometry.attributes.position;
            for (let i = 0; i < position.count; i++) {
              const vertex = new THREE.Vector3()
                .fromBufferAttribute(position, i)
                .applyMatrix4(object.matrixWorld);
              assert(
                -plane.distanceToPoint(vertex) > 0.015,
                "head must remain behind the windshield",
              );
            }
          });
        }
      }
      // Probe the entire open cabin from above, excluding the dynamic occupants.
      // Any accidental roof/fastback reconstruction would intercept these rays.
      const ray = new THREE.Raycaster();
      ray.ray.direction.set(0, -1, 0);
      const fixed = car.body.children.filter((object) => object.isMesh);
      for (const x of [-0.4, 0, 0.4])
        for (const z of [0, 0.4, 0.8, 1.1]) {
          ray.ray.origin.set(x, 3, z);
          const hits = ray.intersectObjects(fixed, false);
          assert(hits.length > 0, "the open cabin still needs a floor/seats");
          assert(hits[0].point.y < 1.36, "no opaque roof above the four-seat cabin");
        }
    } finally {
      const expected = [kit.geometries.size, kit.materials.size, kit.textures.size],
        disposed = [0, 0, 0];
      [kit.geometries, kit.materials, kit.textures].forEach((resources, i) =>
        resources.forEach((resource) => resource.addEventListener("dispose", () => disposed[i]++)),
      );
      kit.dispose();
      assert.deepEqual(disposed, expected, "all kit resources must be disposed exactly once");
    }
  });
}

void test("Mustang wheel animation and speech anchors follow motion without spinning calipers", () => {
  const { kit, car } = fixture();
  try {
    const driving = {
      ...idle,
      x: 8,
      z: -3,
      heading: 0.6,
      steering: 0.7,
      vx: Math.sin(0.6) * 12,
      vz: -Math.cos(0.6) * 12,
      speed: 12,
      elapsed: 2,
      drifting: true,
    };
    const localAnchors = car.passengers.map((head) => head.position.clone());
    car.update(driving, 1 / 60, false);
    assert(car.wheels[0].roll.rotation.x < 0, "moving forward spins tires forward");
    assert(car.wheels[0].steering.rotation.y < 0);
    assert.equal(car.wheels[2].steering.rotation.y, 0);
    const spin = car.wheels[0].roll.rotation.x;
    car.update(driving, 0);
    car.update(driving, Number.NaN);
    assert.equal(car.wheels[0].roll.rotation.x, spin, "zero/invalid dt cannot advance rotation");
    car.root.updateMatrixWorld(true);
    car.passengers.forEach((head, i) => {
      const expected = car.body.localToWorld(localAnchors[i].clone());
      assert(
        head.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-10,
        "city speech head anchors must follow the transformed body",
      );
    });
    for (const wheel of car.wheels) {
      const caliper = wheel.steering.getObjectByName("mustang-fixed-brake-caliper");
      assert(caliper);
      assert.equal(caliper.parent, wheel.steering);
      assert.notEqual(caliper.parent, wheel.roll);
    }
    car.update({ ...idle, vz: 10, speed: 10 }, 0.001);
    assert(car.wheels[0].roll.rotation.x > spin, "reverse changes the spin direction");
  } finally {
    kit.dispose();
  }
});
