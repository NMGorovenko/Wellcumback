'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RaceScene from './scene';
import Link from 'next/link';
import { freshRace, changeLocalRacers, racerId } from '@/lib/game/race/engine';
import { nordschleifeCourse as course } from '@/lib/game/race/course';
import type { VehicleId } from '@/lib/game/race/vehicles';

function freshReview() {
  const state = freshRace();
  state.trackId = 'nordschleife';
  state.phase = 'racing';
  const p = course.sample(0);
  state.racers[0].elevation = p.y;
  Object.assign(state.racers[0].car, {
    x: p.x,
    z: p.z,
    heading: Math.atan2(p.dx, -p.dz),
    speed: 20,
  });
  return state;
}

/** Isolated development surface: inspects the real renderer without touching
 * saved games, online rooms, race results or the regular game's state. */
export default function RaceReview() {
  const game = useRef(freshReview());
  const [review, setReview] = useState({
    distance: 0,
    speed: 20,
    lateral: 0,
    players: 1,
    vehicle: 'mustang' as VehicleId,
    headingOffset: 0,
  });
  const place = useCallback((input: typeof review) => {
    const s = game.current;
    s.trackId = 'nordschleife';
    s.phase = 'lobby';
    changeLocalRacers(s, 0, input.players as 1 | 2 | 3, 'Осмотр');
    s.phase = 'racing';
    s.paused = false;
    s.racers.forEach((r, i) => {
      const p = course.sample(input.distance - i * 7);
      r.vehicleId = input.vehicle;
      r.colorId = i ? 'yellow' : input.vehicle === 'amg-gt' ? 'black' : 'red';
      r.elevation = p.y;
      r.pitch = Math.atan2(course.sample(p.distance + 1).y - p.y, 1);
      Object.assign(r.car, {
        x: p.x - p.dz * input.lateral,
        z: p.z + p.dx * input.lateral,
        heading: Math.atan2(p.dx, -p.dz) + input.headingOffset,
        speed: input.speed,
      });
    });
    setReview(input);
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const abort = new AbortController();
    context.registerTool(
      {
        name: 'inspect_race_section',
        description:
          'Inspect an isolated development scene at a track distance. Changes only this review scene, never a saved game or a race outcome. The real game renderer/camera is used.',
        inputSchema: {
          type: 'object',
          properties: {
            distance: { type: 'number', minimum: 0, maximum: 4000 },
            speed: { type: 'number', minimum: 0, maximum: 54 },
            lateral: { type: 'number', minimum: -7, maximum: 7 },
            players: { type: 'integer', enum: [1, 2, 3] },
            vehicle: { type: 'string', enum: ['mustang', 'amg-gt'] },
            headingOffset: { type: 'number', minimum: -3.15, maximum: 3.15 },
          },
          required: [
            'distance',
            'speed',
            'lateral',
            'players',
            'vehicle',
            'headingOffset',
          ],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: typeof review) => {
          if (
            !Number.isFinite(
              input.distance +
                input.speed +
                input.lateral +
                input.headingOffset,
            ) ||
            input.distance < 0 ||
            input.distance > 4000 ||
            input.speed < 0 ||
            input.speed > 54 ||
            Math.abs(input.lateral) > 7 ||
            Math.abs(input.headingOffset) > 3.15 ||
            ![1, 2, 3].includes(input.players) ||
            !['mustang', 'amg-gt'].includes(input.vehicle)
          )
            throw new Error('Invalid review position');
          place(input);
          const p = course.sample(input.distance);
          return {
            ...input,
            section: p.name,
            x: p.x,
            y: p.y,
            z: p.z,
            length: course.length,
          };
        },
      },
      { signal: abort.signal },
    );
    return () => abort.abort();
  }, [place]);
  const label = course.sample(review.distance).name || 'Nordschleife';
  return (
    <main className="race-stage" style={{ position: 'fixed', inset: 0 }}>
      <RaceScene
        game={game}
        localIds={Array.from({ length: review.players }, (_, i) =>
          racerId(0, i),
        )}
        configuration={`review:${review.players}:${review.vehicle}`}
      />
      <aside
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          background: '#142c35df',
          color: '#edf1da',
          padding: '10px 14px',
          borderRadius: 8,
          font: '13px sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span>
          Осмотр · {label} · {Math.round(review.distance)} м /{' '}
          {Math.round(course.length)} м
        </span>
        <input
          aria-label="Участок трассы"
          type="range"
          min="0"
          max={Math.floor(course.length)}
          step="1"
          value={review.distance}
          onChange={(e) =>
            place({ ...review, distance: Number(e.target.value) })
          }
        />
        <button
          onClick={() =>
            place({ ...review, players: (review.players % 3) + 1 })
          }
        >
          {review.players} экран
        </button>
        <button
          onClick={() =>
            place({
              ...review,
              vehicle: review.vehicle === 'mustang' ? 'amg-gt' : 'mustang',
            })
          }
        >
          {review.vehicle}
        </button>
        <Link href="/">В игру</Link>
      </aside>
    </main>
  );
}
