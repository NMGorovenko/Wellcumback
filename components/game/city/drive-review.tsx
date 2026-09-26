'use client';
import { useCallback, useRef, useState } from 'react';
import CityHub from './city-hub';
import {
  freshCity,
  resetCityCar,
  type CityState,
} from '@/lib/game/city/engine';
import { CITY_ROUTES } from '@/lib/game/city/layout';
import type { FrameProfileReport } from '@/lib/game/graphics/frame-profile';
import { cityAudioProfile } from '@/hooks/use-city-audio';
import { useControlSettings } from '@/hooks/use-control-settings';
const route = [
  ...CITY_ROUTES.studPlaneta.slice(1),
  ...CITY_ROUTES.studPlaneta.slice().reverse().slice(1),
];
const noop = () => {};
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
/** Real CityHub: normal input/physics/React HUD/minimap/audio; no simulated clock. */
export default function DriveReview() {
  useControlSettings();
  const game = useRef(freshCity()),
    run = useRef(false),
    cursor = useRef(0),
    laps = useRef(0),
    history = useRef<object[]>([]);
  const [running, setRunning] = useState(false),
    [sound, setSound] = useState(true);
  const [sample, setSample] = useState<object>();
  const [exported, setExported] = useState('');
  const capture = useCallback((report: FrameProfileReport) => {
    const next = {
      ...report,
      audio: { ...cityAudioProfile },
      x: Math.round(game.current.x),
      z: Math.round(game.current.z),
      elapsed: Math.round(game.current.elapsed),
      waypoint: cursor.current,
      laps: laps.current,
    };
    history.current.push(next);
    if (history.current.length > 900) history.current.shift();
    setSample(next);
  }, []);
  const drive = useCallback((s: CityState) => {
    if (!run.current || s.paused) return;
    const p = route[cursor.current],
      dx = p.x - s.x,
      dz = p.z - s.z,
      d = Math.hypot(dx, dz);
    if (d < 3) {
      cursor.current++;
      if (cursor.current === route.length) {
        cursor.current = 0;
        laps.current++;
      }
      return { throttle: 0, steer: 0, handbrake: false };
    }
    const a = Math.atan2(
      Math.sin(Math.atan2(dx, -dz) - s.heading),
      Math.cos(Math.atan2(dx, -dz) - s.heading),
    );
    const forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
    const desired =
      Math.min(20, Math.sqrt(7 * d)) * Math.max(0.16, Math.cos(a));
    return {
      throttle: clamp((desired - forward) * 0.35, -1, 1),
      steer: clamp(a * 2, -1, 1),
      handbrake: false,
    };
  }, []);
  return (
    <main
      className="shell play-viewport hub city-mode"
      style={{ position: 'fixed', inset: 0 }}
    >
      <CityHub
        game={game}
        sound={sound}
        players={1}
        onPlay={noop}
        onStories={noop}
        onRaces={noop}
        onPlayers={noop}
        onControls={noop}
        onFullscreen={noop}
        onProfile={capture}
        inspectionDrive={drive}
      />
      <aside
        style={{
          position: 'absolute',
          left: 12,
          top: 100,
          zIndex: 200,
          background: '#122e',
          color: 'white',
          padding: 10,
          fontSize: 12,
        }}
      >
        <button
          onClick={() => {
            run.current = !run.current;
            setRunning(run.current);
            game.current.paused = false;
          }}
        >
          {running ? 'Остановить заезд' : 'Начать заезд'}
        </button>
        <button onClick={() => setSound((v) => !v)}>
          {sound ? 'Выключить мотор' : 'Включить мотор'}
        </button>
        <button
          onClick={() => {
            resetCityCar(game.current);
            cursor.current = 0;
            laps.current = 0;
          }}
        >
          Сбросить заезд
        </button>
        <button
          onClick={() => {
            const file = new Blob([JSON.stringify(history.current, null, 2)], {
              type: 'application/json',
            });
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'city-drive-profile.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Скачать замеры
        </button>
        <button onClick={() => setExported(JSON.stringify(history.current))}>
          Показать замеры
        </button>
        {exported && (
          <textarea aria-label="История замеров" readOnly value={exported} />
        )}
        <pre aria-label="Профиль поездки">
          {JSON.stringify(sample, null, 2)}
        </pre>
      </aside>
    </main>
  );
}
