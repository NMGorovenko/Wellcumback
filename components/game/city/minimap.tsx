'use client';
import { memo } from 'react';
import {
  cityNavigationRoute,
  cityRouteLength,
  minimapTarget,
} from '@/lib/game/city/navigation';
import { currentCityStreet } from '@/lib/game/city/street-names';
import { Maximize2 } from 'lucide-react';
import {
  BRIDGES,
  CITY_PARKING,
  CITY_BOUNDS,
  CITY_ISLANDS,
  RIVER_SECTIONS,
  ROUNDABOUT,
  cityBuildings,
  cityRoads,
  cityStops,
} from '@/lib/game/city/layout';
import type { CityState } from '@/lib/game/city/engine';

const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
const river = [
  ...RIVER_SECTIONS.map((p) => `${p.x},${p.z - p.half}`),
  ...RIVER_SECTIONS.slice()
    .reverse()
    .map((p) => `${p.x},${p.z + p.half}`),
].join(' ');
/** Shared world coordinates make both bridges and both banks reliable at any scale. */
export const MapStreets = memo(function MapStreets() {
  return (
    <>
      <rect
        x={minX}
        y={minZ}
        width={maxX - minX}
        height={maxZ - minZ}
        fill="#263e36"
      />
      <polygon points={river} fill="#418399" />
      {CITY_ISLANDS.map((i) => (
        <polygon
          key={i.id}
          points={i.points.map((p) => `${p.x},${p.z}`).join(' ')}
          fill="#708858"
        />
      ))}
      {CITY_PARKING.map((p) => (
        <rect
          key={p.id}
          x={p.x - p.w / 2}
          y={p.z - p.d / 2}
          width={p.w}
          height={p.d}
          fill="#68787a"
        />
      ))}
      {cityBuildings.map((b, i) => (
        <rect
          key={i}
          x={b.x - b.w / 2}
          y={b.z - b.d / 2}
          width={b.w}
          height={b.d}
          rx=".8"
          fill="#687568"
        />
      ))}
      {cityRoads.map((r) => (
        <line
          key={r.id}
          x1={r.from.x}
          y1={r.from.z}
          x2={r.to.x}
          y2={r.to.z}
          stroke="#a3ae9c"
          strokeWidth={r.width}
          strokeLinecap="round"
        />
      ))}
      {BRIDGES.map((b) => (
        <polyline
          key={b.id}
          points={b.points.map((p) => `${p.x},${p.z}`).join(' ')}
          stroke="#d2c3a3"
          strokeWidth={b.w}
          fill="none"
        />
      ))}
      <circle
        cx={ROUNDABOUT.x}
        cy={ROUNDABOUT.z}
        r={ROUNDABOUT.outerRadius}
        fill="#a3ae9c"
      />
      <circle
        cx={ROUNDABOUT.x}
        cy={ROUNDABOUT.z}
        r={ROUNDABOUT.innerRadius}
        fill="#57724b"
      />
    </>
  );
});
export function MapCar({
  state,
  size,
}: {
  state: Pick<CityState, 'x' | 'z' | 'heading'> &
    Partial<Pick<CityState, 'elevation'>>;
  size: number;
}) {
  return (
    <g
      transform={`translate(${state.x} ${state.z}) rotate(${(state.heading * 180) / Math.PI}) scale(${size})`}
    >
      <circle r="7.5" fill="#142922" fillOpacity=".9" />
      <path
        d="M0 -6 L4.5 4 L0 2 L-4.5 4 Z"
        fill="#fff7df"
        stroke="#d74032"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </g>
  );
}
export default function CityMinimap({
  state,
  target,
  onExpand,
}: {
  state: Pick<CityState, 'x' | 'z' | 'heading'> &
    Partial<Pick<CityState, 'elevation'>>;
  target: number;
  onExpand: () => void;
}) {
  const destination = cityStops[target];
  const route = cityNavigationRoute(state, destination);
  const marker = minimapTarget(state, destination);
  const distance = cityRouteLength(route);
  return (
    <button
      type="button"
      className="city-minimap"
      onClick={onExpand}
      aria-label={`Ближайшие улицы. Цель: ${destination.title}. Открыть карту города`}
      title="Карта города · M"
      aria-keyshortcuts="M"
    >
      <span className="city-minimap-title">
        <span>{currentCityStreet(state) || 'РЯДОМ С ТОБОЙ'}</span>
        <span>
          С ↑ <Maximize2 size={11} />
        </span>
      </span>
      <svg
        viewBox={`${state.x - 330} ${state.z - 225} 660 450`}
        aria-hidden="true"
      >
        <MapStreets />
        {route.length > 1 && (
          <polyline
            points={route.map((p) => `${p.x},${p.z}`).join(' ')}
            fill="none"
            stroke="#eff59d"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {cityStops
          .filter(
            (p) =>
              Math.abs(p.x - state.x) < 330 && Math.abs(p.z - state.z) < 225,
          )
          .map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.z}
              r="11"
              fill={p.color}
              stroke="#142922"
              strokeWidth="4"
            />
          ))}
        <g transform={`translate(${marker.x} ${marker.z})`}>
          <circle r="22" fill="#172a24" stroke="#edf4a6" strokeWidth="4" />
          {marker.offscreen ? (
            <path
              d="M0 -13 L9 7 L0 3 L-9 7 Z"
              transform={`rotate(${marker.angle})`}
              fill="#edf4a6"
            />
          ) : (
            <circle r="9" fill="#edf4a6" />
          )}
        </g>
        <MapCar state={state} size={3.8} />
      </svg>
      <span className="city-minimap-caption">
        <span>{destination.title}</span>
        <b>
          {distance > 999
            ? `${(distance / 1000).toFixed(1)} км`
            : `${Math.round(distance)} м`}
        </b>
      </span>
    </button>
  );
}
