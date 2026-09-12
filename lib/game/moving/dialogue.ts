/** Stable IDs identify the comic captions shared by simulation and presentation. */
export const MOVING_DIALOGUE = {
  start: {
    speaker: 'Настя',
    text: 'Ярик, сначала упакуем вещи. Ты точно уверен, что нам хватит сумок?',
  },
  alert: {
    speaker: 'Ноутбук',
    text: 'Критический алерт. Прод решил переехать вместе с вами.',
  },
  fixed: {
    speaker: 'Ярик',
    text: 'Всё, починил. Ноутбук пока не упаковываем.',
  },
  alertConnection: {
    speaker: 'Ноутбук',
    text: 'Соединение потеряно. Кажется, интернет тоже начал переезд.',
  },
  fixedConnection: {
    speaker: 'Ярик',
    text: 'Связь вернулась. Пока ещё по старому адресу.',
  },
  alertQueue: {
    speaker: 'Ноутбук',
    text: 'Очередь задач встала. Не только сумки ждут своей ходки.',
  },
  fixedQueue: {
    speaker: 'Ярик',
    text: 'Задачи поехали. Теперь бы сумки так же.',
  },
  toilet: {
    speaker: 'Ярик',
    text: 'Кажется, шаурма тоже просится на выход. Я сейчас вернусь.',
  },
  relief: { speaker: 'Ярик', text: 'Я снова в строю. Где моя сумка?' },
  yarikRest: {
    speaker: 'Ярик',
    text: 'Сяду на минутку. Один рилс — и обратно.',
  },
  nastyaRest: {
    speaker: 'Настя',
    text: 'Я заслужила диван. Этот рилс, между прочим, про переезд.',
  },
  packed: {
    speaker: 'Настя',
    text: 'Всё по сумкам. Теперь застёгиваем и несём к двери.',
  },
  together: {
    speaker: 'Настя',
    text: 'Раз, два… Вместе. Только не тяни в другую сторону.',
  },
  firstBag: {
    speaker: 'Ярик',
    text: 'Первая сумка у двери. Оказывается, это была разминка.',
  },
  finish: {
    speaker: 'Настя',
    text: 'Первая ходка готова. Смотри, у квартиры всё это время был пол.',
  },
} as const;
export type MovingDialogueId = keyof typeof MOVING_DIALOGUE;
