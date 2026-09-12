import type { MovingState } from './types.ts';

/** Revealed only when a duty starts. Counts rotate the small domestic work gag
 * without random timers, hidden answers, typing, or a punishable reaction test. */
export const MOVING_INCIDENTS = [
  {
    id: 'service',
    title: 'Прод притормозил',
    announcement: 'alert',
    fixed: 'fixed',
    operations: [
      { control: 'action', label: 'Посмотреть журнал сбоя' },
      { control: 'secondary', label: 'Перезапустить сервис' },
    ],
  },
  {
    id: 'connection',
    title: 'Связь потерялась',
    announcement: 'alertConnection',
    fixed: 'fixedConnection',
    operations: [
      { control: 'secondary', label: 'Проверить соединение' },
      { control: 'action', label: 'Подключиться заново' },
    ],
  },
  {
    id: 'queue',
    title: 'Задачи зависли',
    announcement: 'alertQueue',
    fixed: 'fixedQueue',
    operations: [
      { control: 'action', label: 'Найти зависшую задачу' },
      { control: 'secondary', label: 'Запустить очередь снова' },
    ],
  },
] as const;
export const LAPTOP_OPERATION_SECONDS = [2, 2.8] as const;
export const LAPTOP_SECONDS =
  LAPTOP_OPERATION_SECONDS[0] + LAPTOP_OPERATION_SECONDS[1];
export const movingIncident = (count: number) =>
  MOVING_INCIDENTS[Math.max(0, count - 1) % MOVING_INCIDENTS.length];

export function movingLaptopCue(s: Pick<MovingState, 'alert'>) {
  const duty = s.alert,
    incident = movingIncident(duty.count);
  const operation = incident.operations[Math.min(1, duty.operation ?? 0)];
  return {
    title: incident.title,
    control: operation.control,
    release: duty.awaitingRelease,
    hold: !duty.awaitingRelease,
    label: duty.awaitingRelease
      ? 'Отпусти кнопки · следующий шаг'
      : duty.inputMismatch
        ? `Сейчас: ${operation.label.toLowerCase()}`
        : `${Math.min(2, duty.operation + 1)}/2 · ${operation.label}`,
  };
}
