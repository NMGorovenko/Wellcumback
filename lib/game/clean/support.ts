import type { CleanState, Point } from './engine.ts';
import { stations } from './layout.ts';

export type Preparation =
  | 'privacy'
  | 'kitPickup'
  | 'kit'
  | 'laundry'
  | 'bucket';
export type CleanSupport = {
  progress: Record<Preparation, number>;
  kitOwner: number;
  completed: number;
};
export type SupportTask = {
  id: Preparation | 'valve' | 'brace';
  target: Point;
  radius: number;
  label: string;
  destination: string;
  progress: number;
  seconds: number;
};
export const freshSupport = (): CleanSupport => ({
  progress: { privacy: 0, kitPickup: 0, kit: 0, laundry: 0, bucket: 0 },
  kitOwner: -1,
  completed: 0,
});
export const supportBenefits: Record<Preparation, string> = {
  privacy: 'Кабинка готова. Можно спокойно выдохнуть.',
  kitPickup: 'Чистая форма в руках. Отнеси её к душевой.',
  kit: 'Форма у душевой. Переодевание займёт меньше времени.',
  laundry: 'Барабан подготовлен. Загрузка быстрее, машинка устойчивее.',
  bucket: 'Ведро с раствором готово. Швабры будут полоскаться быстрее.',
};
/** Optional work never gates the anonymous soldier or recruits a hidden solo helper.
 * Both friends can prepare any free station; a carried kit has one clear owner. */
export function cleanSupportTask(
  s: CleanState,
  actor: number,
): SupportTask | undefined {
  if (
    actor < 1 ||
    actor >= s.players ||
    ['brief', 'clean', 'result'].includes(s.phase)
  )
    return;
  const p = s.support.progress;
  const tasks: SupportTask[] = [];
  const add = (
    id: Preparation,
    target: Point,
    label: string,
    destination: string,
    seconds: number,
  ) => {
    if (p[id] < 1)
      tasks.push({
        id,
        target,
        label,
        destination,
        seconds,
        progress: p[id],
        radius: 65,
      });
  };
  const carrying =
    s.support.kitOwner === actor && p.kitPickup >= 1 && p.kit < 1;
  if (carrying && !s.washed) {
    add(
      'kit',
      { x: stations[2].x, y: 925 },
      'положить чистую форму',
      'к душевой с формой',
      0.9,
    );
  } else {
    if (s.relief < 1)
      add(
        'privacy',
        { x: stations[1].x, y: 915 },
        'подготовить кабинку',
        'к кабинке · подготовить кабинку',
        1.3,
      );
    if (!s.washed && (s.support.kitOwner < 0 || s.support.kitOwner === actor))
      add(
        'kitPickup',
        stations[6],
        'взять чистую форму',
        'к шкафу · взять форму',
        1.1,
      );
    if (!s.pantsLoaded && s.laundryProgress === 0)
      add(
        'laundry',
        stations[3],
        'подготовить барабан',
        'к стиралке · подготовить барабан',
        1.8,
      );
    add(
      'bucket',
      stations[5],
      'развести раствор',
      'к ведру · развести раствор',
      1.6,
    );
  }
  if (s.pantsLoaded) {
    if (s.valve < 1)
      tasks.unshift({
        id: 'valve',
        target: stations[4],
        radius: 70,
        label: 'перекрыть воду',
        destination: 'к вентилю · перекрыть воду',
        progress: s.valve,
        seconds: 2,
      });
    if (s.spin < 1)
      tasks.push({
        id: 'brace',
        target: stations[3],
        radius: 70,
        label: 'придержать стиралку',
        destination: 'к стиралке · придержать корпус',
        progress: 1 - s.balance,
        seconds: 1,
      });
  }
  const distance = (task: SupportTask) =>
    Math.hypot(s.x[actor] - task.target.x, s.y[actor] - task.target.y);
  const nearby = tasks.filter((task) => distance(task) < task.radius);
  if (nearby.length) return nearby[0];
  // Distinct default routes distribute two friends without locking them to roles.
  const preferred =
    actor === 1
      ? ['valve', 'privacy', 'laundry', 'bucket', 'kitPickup', 'kit', 'brace']
      : ['valve', 'kit', 'kitPickup', 'bucket', 'laundry', 'privacy', 'brace'];
  return tasks.sort(
    (a, b) => preferred.indexOf(a.id) - preferred.indexOf(b.id),
  )[0];
}
