'use client';
import { useEffect, useSyncExternalStore } from 'react';
import {
  graphicsPreset,
  type GraphicsSettings as Preferences,
} from '@/lib/game/graphics/settings';
import {
  getGraphicsSnapshot,
  getServerGraphicsSnapshot,
  initializeGraphicsSettings,
  setGraphicsPreset,
  subscribeGraphics,
  updateGraphicsSettings,
} from '@/lib/game/graphics/store';

function Choices<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="graphics-choices">
      <legend>{label}</legend>
      <div>
        {options.map(([key, title]) => (
          <button
            type="button"
            key={key}
            data-control-focus
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {title}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function GraphicsSettings() {
  const { settings, warning } = useSyncExternalStore(
    subscribeGraphics,
    getGraphicsSnapshot,
    getServerGraphicsSnapshot,
  );
  useEffect(initializeGraphicsSettings, []);
  const preset = graphicsPreset(settings);
  return (
    <section className="graphics-settings" aria-label="Настройки графики">
      <Choices
        label="Качество"
        value={preset ?? 'custom'}
        options={[
          ['low', 'Быстрее'],
          ['medium', 'Баланс'],
          ['high', 'Красивее'],
        ]}
        onChange={(value) => {
          if (value !== 'custom') setGraphicsPreset(value);
        }}
      />
      <p className="graphics-setting-note">
        {preset === null
          ? 'Свои настройки.'
          : preset === 'low'
            ? 'Меньше мелких деталей вдали, больше запаса для плавной езды.'
            : preset === 'high'
              ? 'Больше деталей вдали, чётче изображение и тени.'
              : 'Детальные ориентиры рядом, более простые кварталы вдали.'}
      </p>
      <Choices<Preferences['detail']>
        label="Детали города вдали"
        value={settings.detail}
        options={[
          ['low', 'Меньше'],
          ['medium', 'Средне'],
          ['high', 'Больше'],
        ]}
        onChange={(detail) => updateGraphicsSettings({ detail })}
      />
      <Choices<Preferences['shadows']>
        label="Тени"
        value={settings.shadows}
        options={[
          ['off', 'Выкл.'],
          ['low', 'Простые'],
          ['medium', 'Средние'],
          ['high', 'Чёткие'],
        ]}
        onChange={(shadows) => updateGraphicsSettings({ shadows })}
      />
      <Choices<Preferences['resolution']>
        label="Чёткость изображения"
        value={settings.resolution}
        options={[
          [0.75, 'Низкая'],
          [1, 'Обычная'],
          [1.5, 'Высокая'],
          [2, 'Максимальная'],
        ]}
        onChange={(resolution) => updateGraphicsSettings({ resolution })}
      />
      <p className="graphics-setting-note">
        Высокая чёткость заметнее на Retina и 4K.
      </p>
      <Choices<Preferences['frameLimit']>
        label="Ограничение FPS"
        value={settings.frameLimit}
        options={[
          [30, '30'],
          [60, '60'],
          [120, '120'],
          [0, 'Без лимита'],
        ]}
        onChange={(frameLimit) => updateGraphicsSettings({ frameLimit })}
      />
      <p className="graphics-setting-note">
        Лимит снижает нагрузку и нагрев. Настройки применяются сразу, только на
        этом устройстве.
      </p>
      {warning && <p className="control-settings-warning">{warning}</p>}
    </section>
  );
}
