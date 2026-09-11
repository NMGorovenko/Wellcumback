'use client';
import { ArrowRight, Check, RotateCcw, Search, Trophy } from 'lucide-react';
import {
  CONTROLS,
  springWindow,
  throwTargetPower,
  type GameState,
} from '@/lib/game/screen/engine';
import { NAMES, SIDES, ACTION_LABELS, clock } from './screen-hud-data';
import {
  Meter,
  Fill,
  HoldButton,
  SideChooser,
  type KeyRef,
} from './screen-hud-primitives';
type Props = {
  view: GameState;
  selectedPlayer: number;
  setSelectedPlayer: (player: number) => void;
  move: (player: number, side: number) => void;
  clickAction: (player?: number) => void;
  chooseChairs: (count: 1 | 2) => void;
  findLadder: () => void;
  onExit: () => void;
  onNext?: () => void;
  restart: () => void;
  keys: KeyRef;
  unlockAudio: () => void;
};
export function ScreenPhasePanel({
  view,
  selectedPlayer,
  setSelectedPlayer,
  move,
  clickAction,
  chooseChairs,
  findLadder,
  onExit,
  onNext,
  restart,
  keys,
  unlockAudio,
}: Props) {
  const players = view.players;
  const hold = (code: string, label: string, disabled = false) => (
    <HoldButton
      key={code}
      code={code}
      label={label}
      keys={keys}
      unlock={unlockAudio}
      disabled={disabled}
    />
  );
  const selectedWorker = view.workers[selectedPlayer],
    selectedSide = selectedWorker.side;
  const selectedControl = CONTROLS[selectedPlayer];
  const springRange = springWindow(view),
    throwCenter = throwTargetPower(view);
  const toolOwner = view.tool.owner;
  const ownerIsHuman = toolOwner < players;
  const targetLabel = `${NAMES[view.tool.target]}${view.tool.target >= players ? ' · помощник' : ''}`;

  switch (view.phase) {
    case 'frame':
      return (
        <>
          <div className="hud-section-heading">
            <span>Угол {view.corners + 1}</span>
            <strong>
              {view.frameStage === 'align' ? 'Совмести профиль' : 'До щелчка'}
            </strong>
          </div>
          {view.frameStage === 'align' ? (
            <>
              <p className="hud-instruction">
                Два маркера в центре. Сдвиг — A/D, поворот — W/S.
              </p>
              <Meter
                label="Сдвиг профиля"
                value={view.frameFit}
                min={-1}
                max={1}
                target={[-0.1, 0.1]}
                hint="A / D"
              />
              <Meter
                label="Поворот уголка"
                value={view.frameTwist}
                min={-1}
                max={1}
                target={[-0.1, 0.1]}
                hint="W / S"
              />
              <div className="hud-button-grid">
                {hold('KeyA', 'A · ←')}
                {hold('KeyD', 'D · →')}
                {hold('KeyW', 'W · ↶')}
                {hold('KeyS', 'S · ↷')}
              </div>
              <button
                type="button"
                className="hud-primary"
                onClick={() => clickAction()}
              >
                E · Вставить в паз
              </button>
            </>
          ) : (
            <>
              <p className="hud-instruction">
                Нажми E, когда маркер проходит зелёную зону. Напарник держит
                деталь.
              </p>
              <Meter
                label="Момент щелчка"
                value={view.cursor}
                target={[
                  0.5 - (0.075 + view.frameBrace * 0.08),
                  0.5 + (0.075 + view.frameBrace * 0.08),
                ]}
              />
              <button
                type="button"
                className="hud-primary"
                onClick={() => clickAction()}
              >
                E · Щёлкнуть
              </button>
            </>
          )}
          {players > 1 && (
            <div className="hud-helper">
              {hold('Enter', 'Никита · держать Enter')}
              {players === 3 && hold('KeyO', 'Рома · проверить угол O')}
            </div>
          )}
          {players === 1 && (
            <p className="hud-note">
              Никита придерживает профиль. Твоя задача — совместить угол.
            </p>
          )}
        </>
      );
    case 'rods':
      return (
        <>
          <p className="hud-instruction">
            Спицы вставляются в кулиски свободного полотна. Держи действие и
            направляй спицу влево-вправо.
          </p>
          <SideChooser
            state={view}
            selected={selectedPlayer}
            onSelected={setSelectedPlayer}
            onMove={move}
          />
          <Meter
            label="Попади в кулиску"
            value={view.rodAlignment[selectedSide]}
            min={-1}
            max={1}
            target={[
              view.rodTarget[selectedSide] - 0.19,
              view.rodTarget[selectedSide] + 0.19,
            ]}
            hint={
              selectedPlayer === 0
                ? 'A / D'
                : selectedPlayer === 1
                  ? '← / →'
                  : 'J / L'
            }
          />
          <Fill label="Спица внутри" value={view.rods[selectedSide]} />
          <Fill
            label={
              view.rodJam[selectedSide] > 0
                ? 'Закусило — отпусти действие'
                : 'Сопротивление ткани'
            }
            value={view.rodPressure[selectedSide]}
            danger={view.rodPressure[selectedSide] > 0.6}
          />
          <div className="hud-button-grid">
            {hold(selectedControl.left, '← Направить')}
            {hold(selectedControl.right, 'Направить →')}
          </div>
          {hold(
            selectedControl.action,
            `${ACTION_LABELS[selectedPlayer]} · Держать и вставлять`,
          )}
          <p className="hud-note">
            Напарник напротив держит полотно своей клавишей действия. Если
            закусило — отпусти и поправь направление.
          </p>
        </>
      );
    case 'tension':
      return (
        <>
          <div className="hud-tool-owner">
            <span>Единственная отвёртка</span>
            <strong>
              {view.tool.status === 'ground'
                ? 'На полу'
                : view.tool.status === 'flight'
                  ? `Летит к ${targetLabel}`
                  : `${NAMES[toolOwner]}${ownerIsHuman ? '' : ' · помощник'}`}
            </strong>
          </div>
          <SideChooser
            state={view}
            selected={selectedPlayer}
            onSelected={setSelectedPlayer}
            onMove={move}
          />
          {view.tool.status === 'flight' ? (
            <>
              <Fill label="Лови за рукоятку" value={view.tool.flight} />
              <p className="hud-instruction">
                {view.tool.target < players
                  ? `${NAMES[view.tool.target]}, держи ${ACTION_LABELS[view.tool.target]} при подлёте.`
                  : 'Никита ловит. Точный бросок — твоя половина работы.'}
              </p>
              {view.tool.target < players &&
                hold(
                  CONTROLS[view.tool.target].action,
                  `${ACTION_LABELS[view.tool.target]} · Поймать`,
                )}
            </>
          ) : view.tool.status === 'ground' ? (
            <>
              <p className="hud-instruction">
                Отвёртка у{' '}
                {
                  ['дальней', 'правой', 'ближней', 'левой'][
                    view.tool.groundSide
                  ]
                }{' '}
                стороны. Подойди и подними.
              </p>
              <button
                type="button"
                className="hud-secondary"
                onClick={() => move(selectedPlayer, view.tool.groundSide)}
              >
                Подойти · {NAMES[selectedPlayer]}
              </button>
              <button
                type="button"
                className="hud-primary"
                onClick={() => clickAction(selectedPlayer)}
              >
                {ACTION_LABELS[selectedPlayer]} · Поднять отвёртку
              </button>
            </>
          ) : (
            <>
              {view.tool.status === 'charging' || view.tool.needsPass ? (
                <>
                  <p className="hud-instruction">
                    Передай инструмент напарнику напротив. Держи Q и отпусти в
                    зелёном секторе.
                  </p>
                  <Meter
                    label={`Бросок → ${targetLabel}`}
                    value={
                      view.tool.status === 'charging' ? view.tool.charge : 0
                    }
                    target={[throwCenter - 0.105, throwCenter + 0.105]}
                  />
                  {ownerIsHuman ? (
                    hold(
                      'KeyQ',
                      'Q · Зарядить и отпустить бросок',
                      view.spring.active,
                    )
                  ) : (
                    <p className="hud-note">
                      Никита сейчас вернёт отвёртку. Приготовь E.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="hud-instruction">
                    Держи действие, натяни пружину и отпусти в зелёном секторе.
                  </p>
                  <Meter
                    label="Усилие на пружине"
                    value={view.spring.active ? view.spring.power : 0}
                    target={springRange}
                    danger={view.spring.power > springRange[1]}
                  />
                  {ownerIsHuman ? (
                    hold(
                      CONTROLS[toolOwner].action,
                      `${ACTION_LABELS[toolOwner]} · Натянуть → отпустить`,
                    )
                  ) : (
                    <p className="hud-note">
                      Никита натягивает противоположный край. Потом ловишь ты.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          <p className="hud-note">
            Равномерно, по кругу: разница больше одной пружины отрывает край.
            Следующая свободная сторона:{' '}
            <b>{SIDES[view.recommendedSide].toLowerCase()}</b>.
          </p>
          <div className="hud-mini-stats">
            <span>
              {view.tool.catches} <small>поймано</small>
            </span>
            <span>
              {view.tool.misses} <small>мимо</small>
            </span>
          </div>
        </>
      );
    case 'drill':
      return (
        <>
          <div className="hud-section-heading">
            <span>Отверстие {view.holes.length + 1} / 2</span>
            <strong>
              {view.drillMode === 'position'
                ? 'Подставить стулья'
                : view.drillMode === 'climb'
                  ? 'Без резких движений'
                  : 'Сверлим с перерывами'}
            </strong>
          </div>
          {view.drillMode === 'position' ? (
            <>
              <p className="hud-instruction">
                A/D перевози стулья под отмеченную точку. E — залезть, когда
                маркер в центре.
              </p>
              <Meter
                label="Стулья под отметкой"
                value={view.chairX}
                min={-7}
                max={7}
                target={view.holes.length === 0 ? [-4.75, -4.05] : [4.05, 4.75]}
              />
              <div
                className="hud-inline-choice"
                aria-label="Количество стульев"
              >
                <button
                  type="button"
                  aria-pressed={view.chairs === 1}
                  onClick={() => chooseChairs(1)}
                >
                  1 стул<small>ниже и устойчивее</small>
                </button>
                <button
                  type="button"
                  aria-pressed={view.chairs === 2}
                  onClick={() => chooseChairs(2)}
                >
                  2 стула<small>выше и веселее</small>
                </button>
              </div>
              <div className="hud-button-grid">
                {hold('KeyA', 'A · ← Везти')}
                {hold('KeyD', 'Везти → · D')}
              </div>
              <button
                type="button"
                className="hud-primary"
                onClick={() => clickAction()}
              >
                E · Залезть
              </button>
              <button
                type="button"
                className="hud-text-button"
                onClick={findLadder}
              >
                <Search size={14} /> Всё-таки поискать стремянку
              </button>
            </>
          ) : view.drillMode === 'climb' ? (
            <>
              <Fill label="Поднимаемся" value={view.climb} />
              <p className="hud-note">
                Последний момент, когда стул ещё выглядит хорошей идеей.
              </p>
            </>
          ) : (
            <>
              <Meter
                label="Равновесие"
                value={view.balance}
                min={-1}
                max={1}
                target={[-0.5, 0.5]}
                hint={players === 1 ? 'Никита страхует' : 'A / D'}
                danger={Math.abs(view.balance) > 0.7}
              />
              <Fill label="Отверстие" value={view.drill} />
              <Fill
                label={
                  view.drillHeat > 0.75
                    ? 'Отпусти — дрель горячая'
                    : 'Нагрев дрели'
                }
                value={view.drillHeat}
                danger={view.drillHeat > 0.75}
              />
              {view.holes.length > 0 && (
                <p className="hud-reading">
                  Относительно первого:{' '}
                  <strong>
                    {Math.abs(view.aim - view.holes[0]) < 0.04
                      ? 'на одном уровне'
                      : view.aim > view.holes[0]
                        ? 'выше'
                        : 'ниже'}
                  </strong>
                </p>
              )}
              <p className="hud-instruction">
                {players === 1
                  ? 'W/S выбирают высоту. E сверлит. Отпускай, чтобы остудить.'
                  : 'Ярослав держит A/D. Никита целится стрелками и сверлит Enter.'}
              </p>
              {players > 1 && (
                <div className="hud-button-grid">
                  {hold('KeyA', 'A · держать ←')}
                  {hold('KeyD', 'держать → · D')}
                </div>
              )}
              <div className="hud-button-grid">
                {hold(players === 1 ? 'KeyW' : 'ArrowUp', '↑ Целиться выше')}
                {hold(players === 1 ? 'KeyS' : 'ArrowDown', '↓ Целиться ниже')}
              </div>
              {hold(
                players === 1 ? 'KeyE' : 'Enter',
                `${players === 1 ? 'E' : 'Enter'} · Сверлить`,
              )}
              {players === 3 && hold('KeyO', 'Рома · страховать O')}
            </>
          )}
        </>
      );
    case 'lift':
      return (
        <>
          <p className="hud-instruction">
            Поднимайте оба края вместе. Притормози у крючка и держи действие.
            Один край уже может висеть, пока второй ловишь.
          </p>
          <Meter
            label={view.latched[0] ? 'Левый зацепился ✓' : 'Левый край'}
            value={view.liftLeft - view.holes[0]}
            min={-1.5}
            max={1.5}
            target={[-0.12, 0.12]}
            hint="W / S"
          />
          <Meter
            label={view.latched[1] ? 'Правый зацепился ✓' : 'Правый край'}
            value={view.liftRight - view.holes[1]}
            min={-1.5}
            max={1.5}
            target={[-0.12, 0.12]}
            hint={players === 1 ? 'Никита помогает' : '↑ / ↓'}
          />
          <Meter
            label="Сдвиг к крючкам"
            value={view.liftX}
            min={-2}
            max={2}
            target={[-0.16, 0.16]}
            hint="A / D"
          />
          <div className="hud-hook-status">
            <span className={view.latched[0] ? 'is-ready' : ''}>
              {view.latched[0] ? (
                <Check size={15} />
              ) : (
                <span className="hook-dot" />
              )}
              Левый
            </span>
            <span className={view.latched[1] ? 'is-ready' : ''}>
              {view.latched[1] ? (
                <Check size={15} />
              ) : (
                <span className="hook-dot" />
              )}
              Правый
            </span>
          </div>
          <div className="hud-button-grid">
            {hold('KeyW', 'W · левый ↑')}
            {hold('KeyS', 'S · левый ↓')}
            {hold('KeyA', 'A · экран ←')}
            {hold('KeyD', 'D · экран →')}
          </div>
          {hold('KeyE', 'E · Зацепить левый край')}
          {players > 1 ? (
            <>
              <div className="hud-button-grid">
                {hold('ArrowUp', '↑ · правый ↑')}
                {hold('ArrowDown', '↓ · правый ↓')}
              </div>
              {hold('Enter', 'Enter · Зацепить правый край')}
            </>
          ) : (
            <p className="hud-note">
              Никита повторяет подъём твоего края и ловит правый крючок вместе с
              твоим E.
            </p>
          )}
          {players === 3 && hold('KeyO', 'Рома · придержать экран O')}
        </>
      );
    case 'level':
      return (
        <>
          <p className="hud-instruction">
            Потолок кривой. Смотри на пузырёк: поправь подвесы и отпусти, чтобы
            уровень успокоился.
          </p>
          <Meter
            label="Пузырьковый уровень"
            value={view.bubble}
            min={-0.22}
            max={0.22}
            target={[-0.012, 0.012]}
            hint={`${Math.abs((view.angle * 180) / Math.PI).toFixed(1)}°`}
          />
          <Fill
            label={
              view.levelStable >= 1
                ? 'Ровно. Можно отпускать'
                : 'Пузырёк успокаивается'
            }
            value={Math.min(1, view.levelStable)}
          />
          <div className="hud-button-grid">
            {hold('KeyA', 'A · поправить ←')}
            {hold('KeyD', 'D · поправить →')}
          </div>
          <button
            type="button"
            className="hud-primary"
            disabled={view.levelStable < 1}
            onClick={() => clickAction()}
          >
            <Check size={16} /> E · Вот теперь ровно
          </button>
          <p className="hud-note">
            «Слева пятнадцать. Справа пятнадцать. А потолок — со своим мнением».
          </p>
        </>
      );
    case 'result':
      return (
        <div className="hud-result">
          <Trophy size={32} className="hud-result-trophy" />
          <span className="tiny-label">КВАРТИРНЫЙ ВОПРОС РЕШЁН</span>
          <h2>Кино будет!</h2>
          <p>Про «тут на полчаса» больше никому не рассказываем.</p>
          <strong className="hud-result-score">
            {view.score.toLocaleString('ru')}
            <small>очков бригады</small>
          </strong>
          <div className="hud-result-stats">
            <span>
              {clock(view.elapsed)}
              <small>провозились</small>
            </span>
            <span>
              {view.tool.catches}
              <small>отвёрток поймано</small>
            </span>
            <span>
              {view.tool.misses}
              <small>бросков в пол</small>
            </span>
            <span>
              {view.falls}
              <small>полётов на диван</small>
            </span>
          </div>
          <button
            type="button"
            className="hud-primary"
            onClick={onNext ?? onExit}
          >
            {onNext ? 'Теперь байка из роты' : 'К другим историям'}{' '}
            <ArrowRight size={16} />
          </button>
          {onNext && (
            <button type="button" className="hud-text-button" onClick={onExit}>
              К итогам вечера
            </button>
          )}
          <button type="button" className="hud-secondary" onClick={restart}>
            <RotateCcw size={14} /> Переделаем нормально
          </button>
        </div>
      );
  }
}
