'use client';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Crosshair,
  MapPin,
  Minus,
  Navigation,
  Plus,
  X,
  Zap,
} from 'lucide-react';
import {
  BRIDGES,
  CITY_BOUNDS,
  CITY_DISTRICTS,
  CITY_ISLANDS,
  cityStops,
} from '@/lib/game/city/layout';
import type { CityState } from '@/lib/game/city/engine';
import {
  cityNavigationRoute,
  cityRouteLength,
  clampCityMapView,
  fullCityMapView,
  zoomCityMap,
} from '@/lib/game/city/navigation';
import type { PadDirection } from '@/lib/game/input/gamepads';
import { MapCar, MapStreets } from './minimap';

export type CityMapHandle = {
  move: (direction: PadDirection) => void;
  confirm: () => void;
};
const shortNames: Record<string, string> = {
  nikita: 'Студгородок',
  yarik: 'Квартира Ярика',
  roma: 'ЖД вокзал',
  'new-home': 'Новый дом',
  roma2: 'Байки Ромы 2',
  planeta: 'Планета',
  komsomoll: 'Комсомолл',
  kubatura: 'Кубатура',
  udachny: 'Удачный',
  akadem: 'Академгородок',
  predmostnaya: 'Предмостная',
  tatyshev: 'Татышев',
  otdyha: 'Остров Отдыха',
};
export const CityMap = forwardRef<
  CityMapHandle,
  {
    state: Pick<CityState, 'x' | 'z' | 'heading'>;
    target: number;
    canTravel: boolean;
    travelReason?: string;
    busy: boolean;
    message?: string;
    onClose: () => void;
    onNavigate: (index: number) => void;
    onTravel: (index: number) => void;
  }
>(function CityMap(
  {
    state,
    target,
    canTravel,
    travelReason,
    busy,
    message,
    onClose,
    onNavigate,
    onTravel,
  },
  ref,
) {
  const [selected, setSelected] = useState(target);
  const [action, setAction] = useState(0);
  const [camera, setCamera] = useState(fullCityMapView);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const surface = useRef<SVGSVGElement>(null);
  const initiallyFitted = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    centerX: number;
    centerZ: number;
  } | null>(null);
  const stop = cityStops[selected];
  const scale = camera.width / size.width,
    height = size.height * scale;
  const routeX = Math.round(state.x / 25) * 25,
    routeZ = Math.round(state.z / 25) * 25;
  const route = useMemo(
    () => cityNavigationRoute({ x: routeX, z: routeZ }, stop),
    [routeX, routeZ, stop],
  );
  const length = cityRouteLength(route);
  const select = (index: number) => {
    setSelected(index);
    const point = cityStops[index];
    setCamera((c) =>
      Math.abs(point.x - c.x) > c.width * 0.42 ||
      Math.abs(point.z - c.z) > (c.width / size.width) * size.height * 0.42
        ? { ...c, x: point.x, z: point.z }
        : c,
    );
  };
  useImperativeHandle(ref, () => ({
    move: (direction) => {
      if (busy) return;
      if (direction === 'left' || direction === 'right')
        setAction(direction === 'right' && canTravel ? 1 : 0);
      else
        select(
          (selected + (direction === 'up' ? -1 : 1) + cityStops.length) %
            cityStops.length,
        );
    },
    confirm: () => {
      if (!busy) {
        if (action === 1 && canTravel) onTravel(selected);
        else onNavigate(selected);
      }
    },
  }));
  useEffect(() => {
    entries.current[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
      if (!initiallyFitted.current && rect.width > 0 && rect.height > 0) {
        initiallyFitted.current = true;
        setCamera(fullCityMapView(rect.width / rect.height));
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      setCamera((view) => {
        const units = view.width / box.width;
        const anchor = {
          x: view.x + (event.clientX - box.left - box.width / 2) * units,
          z: view.z + (event.clientY - box.top - box.height / 2) * units,
        };
        return zoomCityMap(
          view,
          Math.exp(Math.max(-160, Math.min(160, event.deltaY)) * 0.002),
          anchor,
        );
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
    };
  }, []);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const fit = () => {
    const view = fullCityMapView();
    const neededWidth =
      ((CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ + 400) * size.width) / size.height;
    setCamera({ ...view, width: Math.max(view.width, neededWidth) });
  };
  return (
    <dialog
      open
      ref={dialog}
      className="city-map-overlay"
      aria-modal="true"
      aria-labelledby="city-map-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.code === 'Space' &&
          event.target instanceof HTMLElement &&
          event.target.closest('button')
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.target.closest('button')?.click();
          return;
        }
        if (event.code === 'Tab') {
          const controls = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), [tabindex="0"]',
            ) ?? []),
          ];
          const index = controls.indexOf(document.activeElement as HTMLElement);
          if (event.shiftKey && index <= 0) {
            event.preventDefault();
            controls.at(-1)?.focus();
          } else if (
            !event.shiftKey &&
            (index < 0 || index === controls.length - 1)
          ) {
            event.preventDefault();
            controls[0]?.focus();
          }
        }
        if (event.code === 'Equal' || event.code === 'Minus') {
          event.preventDefault();
          event.stopPropagation();
          setCamera((c) =>
            zoomCityMap(c, event.code === 'Equal' ? 0.75 : 1.35),
          );
        }
      }}
    >
      <header className="city-map-header">
        <div>
          <span>КАРТА ГОРОДА</span>
          <h2 id="city-map-title">Красноярск</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Закрыть карту"
        >
          <span>Назад</span>
          <kbd>M / Esc</kbd>
          <X size={19} />
        </button>
      </header>
      <div className="city-map-body">
        <div className="city-map-canvas">
          <svg
            ref={surface}
            viewBox={`${camera.x - camera.width / 2} ${camera.z - height / 2} ${camera.width} ${height}`}
            aria-label="Улицы и места Красноярска. Потяни карту, чтобы переместить её; колесо меняет масштаб."
            onPointerDown={(event) => {
              if (
                event.button !== 0 ||
                (event.target as Element).closest('[data-city-destination]')
              )
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                centerX: camera.x,
                centerZ: camera.z,
              };
            }}
            onPointerMove={(event) => {
              const from = drag.current;
              if (from?.id === event.pointerId)
                setCamera((c) =>
                  clampCityMapView({
                    ...c,
                    x: from.centerX - (event.clientX - from.x) * scale,
                    z: from.centerZ - (event.clientY - from.y) * scale,
                  }),
                );
            }}
            onPointerUp={(event) => {
              if (drag.current?.id === event.pointerId) drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <MapStreets />
            {CITY_DISTRICTS.map((d) => (
              <text
                className="city-map-district"
                key={d.name}
                x={d.x}
                y={d.z}
                fontSize={scale * 12}
                textAnchor="middle"
              >
                {d.name}
              </text>
            ))}
            {CITY_ISLANDS.map((i) => (
              <text
                className="city-map-water-label"
                key={i.id}
                x={i.x}
                y={i.z - scale * 25}
                fontSize={scale * 11}
                textAnchor="middle"
              >
                {i.name}
              </text>
            ))}
            {BRIDGES.map((b) => (
              <text
                className="city-map-bridge"
                key={b.id}
                x={b.x + scale * 9}
                y={b.z}
                fontSize={scale * 10}
              >
                {b.title}
              </text>
            ))}
            {route.length > 1 && (
              <polyline
                points={route.map((p) => `${p.x},${p.z}`).join(' ')}
                fill="none"
                stroke="#edeea0"
                strokeWidth={scale * 3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {cityStops.map((point, index) => {
              const chosen = index === selected;
              const offsetY =
                point.id === 'roma2' ? -22 : point.id === 'roma' ? 22 : 0;
              return (
                <a
                  href={`#city-stop-${point.id}`}
                  key={point.id}
                  data-city-destination={point.id}
                  className="city-map-marker"
                  onClick={(event) => {
                    event.preventDefault();
                    select(index);
                  }}
                  aria-label={point.title}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      select(index);
                    }
                  }}
                >
                  <title>{point.title}</title>
                  <circle
                    cx={point.x}
                    cy={point.z}
                    r={scale * (chosen ? 9 : 6)}
                    fill={chosen ? '#eff4ab' : point.color}
                    stroke="#142b24"
                    strokeWidth={scale * 2}
                  />
                  <text
                    x={point.x + scale * 12}
                    y={point.z + scale * (4 + offsetY)}
                    fontSize={scale * (chosen ? 13 : 11)}
                    className={chosen ? 'selected' : ''}
                  >
                    {shortNames[point.id] ?? point.title}
                  </text>
                </a>
              );
            })}
            <MapCar state={state} size={scale * 1.25} />
          </svg>
          <div className="city-map-tools">
            <button
              type="button"
              onClick={() => setCamera((c) => zoomCityMap(c, 0.72))}
              aria-label="Приблизить карту"
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              onClick={() => setCamera((c) => zoomCityMap(c, 1.4))}
              aria-label="Отдалить карту"
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              onClick={() => setCamera({ ...state, width: 1200 })}
              aria-label="Найти машину"
            >
              <Crosshair size={18} />
            </button>
            <button type="button" onClick={fit}>
              Весь город
            </button>
          </div>
          <span className="city-map-north">С ↑</span>
        </div>
        <aside className="city-map-places" aria-label="Места на карте">
          <p>Куда едем?</p>
          <div className="city-map-place-list">
            {cityStops.map((point, index) => (
              <button
                key={point.id}
                type="button"
                ref={(node) => {
                  entries.current[index] = node;
                }}
                aria-pressed={selected === index}
                onFocus={() => select(index)}
                onClick={() => select(index)}
                disabled={busy}
              >
                <span style={{ background: point.color }} />
                <span>{point.title}</span>
                {index === target && (
                  <Navigation size={13} aria-label="Текущая цель" />
                )}
              </button>
            ))}
          </div>
          <div className="city-map-selection">
            <MapPin size={16} />
            <div>
              <strong>{stop.title}</strong>
              <small>{stop.subtitle}</small>
              <span>
                {route.length
                  ? `${(length / 1000).toFixed(1)} км по улицам`
                  : 'Выбери ближайшую дорогу'}
              </span>
            </div>
          </div>
          <div className="city-map-primary">
            <button
              type="button"
              className={action === 0 ? 'pad-selected' : ''}
              disabled={busy}
              onFocus={() => setAction(0)}
              onClick={() => onNavigate(selected)}
            >
              <Navigation size={16} />
              Поставить GPS
            </button>
            <button
              type="button"
              className={action === 1 ? 'pad-selected' : ''}
              disabled={!canTravel || busy}
              onFocus={() => setAction(1)}
              onClick={() => onTravel(selected)}
            >
              <Zap size={16} />
              Переместиться
            </button>
          </div>
          {(!canTravel || message) && (
            <output className="city-map-message">
              {message || travelReason}
            </output>
          )}
        </aside>
      </div>
      <footer>
        Колесо / + − — масштаб · потяни карту мышью · ↑↓ / стик — место · ←→ —
        действие · E / A / × — выбрать · Esc / B / ○ — назад
      </footer>
    </dialog>
  );
});
