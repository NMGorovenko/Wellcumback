'use client';
import { useEffect, useRef, useState } from 'react';
import CityScene from './scene';
import { freshCity } from '@/lib/game/city/engine';
import { cityRoads, type CityPoint } from '@/lib/game/city/layout';
import { citySurfacePose } from '@/lib/game/city/surface';
import type { CityCameraMode } from './camera';

const places: Record<string, CityPoint & { heading: number; road?: string }> = {
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
};
/** A disposable review scene using the actual renderer; never reads or writes saves. */
export default function CityReview() {
  const game = useRef(freshCity()),
    speech = useRef<HTMLOutputElement>(null);
  const [mode, setMode] = useState<CityCameraMode>('cruise');
  const [ready, setReady] = useState(false);
  const [place, setPlace] = useState('Старт');
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
    Object.assign(game.current, p, pose, { speed: 0, vx: 0, vz: 0 });
    setPlace(name);
  }
  useEffect(() => {
    if (!ready) return;
    let last = performance.now(),
      raf = 0;
    const tick = (now: number) => {
      game.current.elapsed += Math.min(0.1, (now - last) / 1000);
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
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          zIndex: 100,
          display: 'flex',
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
          value={mode}
          onChange={(e) => setMode(e.target.value as CityCameraMode)}
        >
          <option value="cruise">Низкая</option>
          <option value="drive">Сверху</option>
          <option value="map">Весь город</option>
        </select>
        <button
          type="button"
          onClick={() => {
            game.current.heading += Math.PI / 4;
          }}
        >
          Повернуть 45°
        </button>
        <span>{ready ? 'Готово' : 'Загрузка…'}</span>
      </div>
    </main>
  );
}
