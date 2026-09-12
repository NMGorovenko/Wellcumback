'use client';
import { memo } from 'react';
import { Maximize2 } from 'lucide-react';
import {
  BRIDGES,
  CITY_BOUNDS,
  RIVER_HALF_WIDTH,
  RIVER_SLOPE,
  ROUNDABOUT,
  cityBuildings,
  cityRoads,
  cityStops,
  riverZ,
} from '@/lib/game/city/layout';
import type { CityState } from '@/lib/game/city/engine';

const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
const waterWidth = RIVER_HALF_WIDTH * Math.hypot(1, RIVER_SLOPE);
const river = `${minX},${riverZ(minX) - waterWidth} ${maxX},${riverZ(maxX) - waterWidth} ${maxX},${riverZ(maxX) + waterWidth} ${minX},${riverZ(minX) + waterWidth}`;
/** Shared world coordinates make both bridges and both banks reliable at any scale. */
const MapStreets = memo(function MapStreets() {
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
        <rect
          key={b.id}
          x={b.x - b.w / 2}
          y={b.z - b.d / 2}
          width={b.w}
          height={b.d}
          fill="#d2c3a3"
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
export default function CityMinimap({
  state,
  target,
  onExpand,
}: {
  state: Pick<CityState, 'x' | 'z' | 'heading'>;
  target: number;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      className="city-minimap"
      onClick={onExpand}
      aria-label={`Миникарта: ${cityStops[target].title}. Открыть весь город`}
      title="Открыть весь город"
    >
      <span className="city-minimap-title">
        <span>КРАСНОЯРСК</span>
        <span>
          С ↑ <Maximize2 size={11} />
        </span>
      </span>
      <svg
        viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}
        aria-hidden="true"
      >
        <MapStreets />
        {cityStops.map((s, i) => (
          <g key={s.id}>
            {i === target && (
              <circle
                cx={s.x}
                cy={s.z}
                r="6"
                fill="none"
                stroke={s.color}
                strokeWidth="1.6"
                className="city-minimap-target"
              />
            )}
            <circle
              cx={s.x}
              cy={s.z}
              r={i === target ? 3.2 : 2.5}
              fill={s.color}
              stroke="#182c27"
              strokeWidth="1.2"
            />
          </g>
        ))}
        <g
          transform={`translate(${state.x} ${state.z}) rotate(${(state.heading * 180) / Math.PI})`}
        >
          <circle r="6.5" fill="#142922" fillOpacity=".8" />
          <path
            d="M0 -6 L4.5 4 L0 2 L-4.5 4 Z"
            fill="#fff7df"
            stroke="#d74032"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </button>
  );
}
