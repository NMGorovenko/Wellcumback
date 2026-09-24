'use client';
import { useEffect, useRef, useState } from 'react';
import CityScene, { type CityReviewCamera } from './scene';
import { freshCity, stepCityCar } from '@/lib/game/city/engine';
import { breakableObjects, freshCityDamage } from '@/lib/game/city/destruction';
import { cityRoads } from '@/lib/game/city/layout';
import { citySurfacePose } from '@/lib/game/city/surface';
import type { CityCameraMode } from './camera';
import {
  CITY_LANDMARK_REVIEW_PLACES,
  type CityReviewPlace,
} from './review-views';

const places: Record<string, CityReviewPlace> = {
  Старт: { x: -769, z: 432.963636, heading: 0 },
  'Мост → Студгородок': {
    x: -625,
    z: 528.408,
    heading: -1.03,
    road: 'bridge-nikolaevsky:2',
  },
  'Под мостом': { x: -700, z: 444.25, heading: -1.303, road: 'left-quay:3' },
  'Орбита с реки': { x: -800, z: 570, heading: 0 },
  ИКИТ: { x: -760, z: 402, heading: -1.05 },
  'Бобровый лог': { x: -858, z: 1211, heading: Math.PI },
  Коммунальный: { x: 150, z: 520, heading: 0 },
  'Театральная площадь': { x: 106, z: 162, heading: 0 },
  ...CITY_LANDMARK_REVIEW_PLACES,
};
/** A disposable review scene using the actual renderer; never reads or writes saves. */
export default function CityReview() {
  const game = useRef(freshCity()),
    speech = useRef<HTMLOutputElement>(null);
  const [mode, setMode] = useState<CityCameraMode>('cruise');
  const [ready, setReady] = useState(false);
  const [place, setPlace] = useState('Старт');
  const [reviewCamera, setReviewCamera] = useState<CityReviewCamera>();
  const impactUntil = useRef(0);
  function impact(kind: 'rail' | 'tree') {
    setReviewCamera(undefined);
    const object = breakableObjects
      .filter((o) => o.kind === kind)
      .sort(
        (a, b) =>
          Math.hypot(a.x + 769, a.z - 433) - Math.hypot(b.x + 769, b.z - 433),
      )[0];
    const dx = kind === 'rail' ? Math.cos(object.angle ?? 0) : 0;
    const dz = kind === 'rail' ? -Math.sin(object.angle ?? 0) : -1;
    const x = object.x - dx * 7,
      z = object.z - dz * 7,
      heading = Math.atan2(dx, -dz);
    Object.assign(game.current, citySurfacePose(x, z, heading, object.y), {
      x,
      z,
      heading,
      vx: dx * 19,
      vz: dz * 19,
      speed: 19,
      damage: freshCityDamage(),
    });
    impactUntil.current = game.current.elapsed + 0.9;
  }
  function inspect(name: string) {
    const p = places[name],
      road = cityRoads.find((r) => r.id === p.road);
    const pose = citySurfacePose(
      p.x,
      p.z,
      p.heading,
      road ? 80 : undefined,
      road ? `road:${road.id}` : undefined,
    );
    Object.assign(game.current, pose, {
      x: p.x,
      z: p.z,
      heading: p.heading,
      speed: 0,
      vx: 0,
      vz: 0,
      travelRevision: (game.current.travelRevision ?? 0) + 1,
    });
    impactUntil.current = 0;
    setReviewCamera(p.view);
    if (p.view) setMode('cruise');
    setPlace(name);
  }
  useEffect(() => {
    if (!ready) return;
    let last = performance.now(),
      raf = 0;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      game.current.elapsed += dt;
      if (game.current.elapsed < impactUntil.current) {
        for (let i = 0; i < 6; i++)
          stepCityCar(
            game.current,
            { throttle: 0, steer: 0, handbrake: false },
            dt / 6,
          );
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);
  return (
    <main className="city-stage" style={{ position: 'fixed', inset: 0 }}>
      <div
        className="city-world"
        style={{
          height: '100%',
          maxHeight: 'none',
          border: 0,
          borderRadius: 0,
        }}
      >
        <CityScene
          game={game}
          speechRef={speech}
          cameraMode={mode}
          onReady={setReady}
          reviewCamera={reviewCamera}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          zIndex: 100,
          display: 'flex',
          flexWrap: 'wrap',
          maxWidth: 'calc(100vw - 24px)',
          gap: 8,
          padding: 8,
          background: '#17322ee8',
          color: 'white',
          borderRadius: 8,
        }}
      >
        <select
          aria-label="Точка осмотра"
          value={place}
          onChange={(e) => inspect(e.target.value)}
        >
          {Object.keys(places).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select
          aria-label="Камера осмотра"
          value={reviewCamera ? 'landmark' : mode}
          onChange={(e) => {
            if (e.target.value === 'landmark') {
              setReviewCamera(places[place].view);
              setMode('cruise');
              return;
            }
            setReviewCamera(undefined);
            setMode(e.target.value as CityCameraMode);
          }}
        >
          {places[place].view && (
            <option value="landmark">Ракурс объекта</option>
          )}
          <option value="cruise">Низкая</option>
          <option value="drive">Сверху</option>
          <option value="map">Весь город</option>
        </select>
        <button
          type="button"
          onClick={() => {
            game.current.heading += Math.PI / 4;
            if (reviewCamera) {
              const { position, look } = reviewCamera,
                dx = position.x - look.x,
                dz = position.z - look.z,
                c = Math.SQRT1_2;
              setReviewCamera({
                ...reviewCamera,
                position: {
                  x: look.x + (dx + dz) * c,
                  y: position.y,
                  z: look.z + (dz - dx) * c,
                },
              });
            }
          }}
        >
          Повернуть 45°
        </button>
        <span>{ready ? 'Готово' : 'Загрузка…'}</span>
        <button onClick={() => impact('rail')} disabled={!ready}>
          Удар в перила
        </button>
        <button onClick={() => impact('tree')} disabled={!ready}>
          Удар в дерево
        </button>
      </div>
    </main>
  );
}
