export type PersonPreset = {
  id: 'yaroslav' | 'nikita' | 'roma' | 'anastasia';
  name: string;
  role: string;
  color: string;
  skin: string;
  hair: string;
  eye: string;
  hairstyle: 'curls' | 'parted' | 'buzz' | 'long';
  beard: boolean;
  uniform: boolean;
  portrait: string;
};

/** Visual data only. Gameplay does not depend on anybody's name or appearance. */
export const people: PersonPreset[] = [
  {
    id: 'yaroslav',
    name: 'Ярослав',
    role: 'Держит ситуацию',
    color: '#393b37',
    skin: '#805739',
    hair: '#211d18',
    eye: '#312821',
    hairstyle: 'curls',
    beard: false,
    uniform: false,
    portrait: '/characters/yaroslav-v1.png',
  },
  {
    id: 'nikita',
    name: 'Никита',
    role: 'Всё рассчитал',
    color: '#604738',
    skin: '#dab397',
    hair: '#302a26',
    eye: '#3e3930',
    hairstyle: 'parted',
    beard: true,
    uniform: false,
    portrait: '/characters/nikita-reference.jpg',
  },
  {
    id: 'roma',
    name: 'Рома',
    role: 'Дембель. Очень ждём',
    color: '#7a859f',
    skin: '#e2b39c',
    hair: '#938473',
    eye: '#798f91',
    hairstyle: 'buzz',
    beard: false,
    uniform: true,
    portrait: '/characters/roma-v1.png',
  },
];

/** The road trip keeps its original three friends; chapter guests live separately. */
export const anastasia: PersonPreset = {
  id: 'anastasia',
  name: 'Анастасия',
  role: 'Упакует даже этот переезд',
  color: '#913f43',
  skin: '#e5bba0',
  hair: '#633821',
  eye: '#697063',
  hairstyle: 'long',
  beard: false,
  uniform: false,
  portrait: '/characters/faces/anastasia.png',
};

export function getPersonPreset(id: PersonPreset['id']): PersonPreset {
  return id === 'anastasia'
    ? anastasia
    : people.find((person) => person.id === id)!;
}
export const room = {
  wall: '#a8aaa0',
  floor: '#735444',
  sofa: '#6c826e',
  ceilingSlope: 0.045,
};
export const stories = [
  {
    id: 'screen',
    title: 'Экран на полстены',
    subtitle: 'Квартирный вопрос',
    available: true,
  },
  {
    id: 'clean',
    title: 'Операция «Чистый проход»',
    subtitle: 'Байки из другой роты',
    available: true,
  },
  {
    id: 'mustang',
    title: 'Красный Mustang',
    subtitle: 'Поездка по Красноярску',
    available: false,
  },
];
