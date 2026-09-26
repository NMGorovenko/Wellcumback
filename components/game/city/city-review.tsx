'use client';
import type { FrameProfileReport } from '@/lib/game/graphics/frame-profile';
import { useCallback, useEffect, useRef, useState } from 'react';
import CityScene, { type CityReviewCamera } from './scene';
import { freshCity, stepCityCar, recoverCityCar } from '@/lib/game/city/engine';
import { breakableObjects, freshCityDamage } from '@/lib/game/city/destruction';
import { freshFlight } from '@/lib/game/city/flight';
import { cityRoads, cityBuildings } from '@/lib/game/city/layout';
import { citySurfacePose } from '@/lib/game/city/surface';
import type { CityCameraMode } from './camera';
import {
  CITY_LANDMARK_REVIEW_PLACES,
  type CityReviewPlace,
} from './review-views';

const places: Record<string, CityReviewPlace> = {
  'Центр · замер': { x: 6, z: 80, heading: 0 },
  'Квант · замер': { x: 6, z: -130, heading: 0 },
  'Набережная · замер': { x: -200, z: 150, heading: Math.PI / 2 },
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
  const [profile, setProfile] = useState<FrameProfileReport>();
  const [tour, setTour] = useState(false);
  const profileHistory = useRef<(FrameProfileReport & { place: string })[]>([]);
  const placeRef = useRef('Старт');
  const captureProfile = useCallback((report: FrameProfileReport) => {
    setProfile(report);
    if (profileHistory.current.length >= 120) profileHistory.current.shift();
    profileHistory.current.push({ ...report, place: placeRef.current });
  }, []);
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
      flight: freshFlight(),
    });
    impactUntil.current = game.current.elapsed + 5;
  }
  function dropOnRoof(kind: 'university' | 'cottage' | 'fuel') {
    const building = cityBuildings.find((b) => (b.kind ?? b.style) === kind)!;
    const x = building.x + (kind === 'cottage' ? building.w * 0.2 : 0),
      z = building.z,
      heading = 0;
    const pose = citySurfacePose(x, z, heading, 180);
    Object.assign(game.current, pose, {
      x,
      z,
      heading,
      elevation: pose.elevation + 12,
      pitch: 0,
      roll: 0,
      vx: 0,
      vz: 0,
      speed: 0,
      damage: freshCityDamage(),
      flight: { ...freshFlight(), airborne: true, vy: -2 },
      travelRevision: (game.current.travelRevision ?? 0) + 1,
    });
    impactUntil.current = game.current.elapsed + 8;
    setReviewCamera(undefined);
    setMode('cruise');
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
      flight: freshFlight(),
      vx: 0,
      vz: 0,
      travelRevision: (game.current.travelRevision ?? 0) + 1,
    });
    impactUntil.current = 0;
    setReviewCamera(p.view);
    if (p.view) setMode('cruise');
    placeRef.current = name;
    setPlace(name);
  }
  useEffect(() => {
    if (!ready || !tour) return;
    const itinerary = [
      'Старт',
      'Центр · замер',
      'Квант · замер',
      'Набережная · замер',
      'Коммунальный',
      'Старт',
    ];
    let index = 0;
    const timer = window.setInterval(
      () => inspect(itinerary[index++ % itinerary.length]),
      15000,
    );
    return () => window.clearInterval(timer);
  }, [ready, tour]);
  useEffect(() => {
    if (!ready) return;
    let last = performance.now(),
      raf = 0;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      game.current.elapsed += dt;
      if (game.current.elapsed < impactUntil.current) {
        for (let i = 0; i < 6; i++) {
          const contact = stepCityCar(
            game.current,
            { throttle: 0, steer: 0, handbrake: false },
            dt / 6,
          );
          if (contact.needsRecovery) recoverCityCar(game.current);
        }
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
          onProfile={captureProfile}
          reviewCamera={reviewCamera}
        />
      </div>
      {profile && (
        <pre
          aria-label="Профиль кадра"
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            zIndex: 110,
            background: '#10201fe8',
            color: 'white',
            padding: 10,
            fontSize: 12,
            pointerEvents: 'none',
          }}
        >
          {JSON.stringify(profile, null, 2)}
        </pre>
      )}
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
        <button disabled={!ready} onClick={() => setTour((v) => !v)}>
          {tour ? 'Остановить цикл' : 'Цикл проверки памяти'}
        </button>
        <button
          onClick={() => {
            const blob = new Blob(
              [JSON.stringify(profileHistory.current, null, 2)],
              { type: 'application/json' },
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'city-frame-profile.json';
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Сохранить замеры
        </button>
        <span>{ready ? 'Готово' : 'Загрузка…'}</span>
        <button onClick={() => dropOnRoof('university')} disabled={!ready}>
          Сброс на крышу
        </button>
        <button onClick={() => dropOnRoof('cottage')} disabled={!ready}>
          Сброс на скат
        </button>
        <button onClick={() => dropOnRoof('fuel')} disabled={!ready}>
          Сброс на навес
        </button>
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
