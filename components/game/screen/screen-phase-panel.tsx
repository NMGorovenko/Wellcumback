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
              {hold('Enter', 'Ярик · держать Enter')}
              {players === 3 && hold('KeyO', 'Рома · проверить угол O')}
            </div>
          )}
          {players === 1 && (
            <p className="hud-note">
              Ярик придерживает профиль. Твоя задача — совместить угол.
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
                  : 'Ярик ловит. Точный бросок — твоя половина работы.'}
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
                      Ярик сейчас вернёт отвёртку. Приготовь E.
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
                      Ярик натягивает противоположный край. Потом ловишь ты.
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
          <p className="hud-instruction">
            Никита слева подаёт и держит. Ярик справа забирается и работает
            двумя инструментами.
          </p>
          {view.drillMode === 'position' && (
            <>
              <div className="hud-button-grid">
                {hold('KeyA', '← Стулья')}
                {hold('KeyD', 'Стулья →')}
              </div>
              <div className="hud-inline-choice">
                <button
                  type="button"
                  aria-pressed={view.chairs === 1}
                  onClick={() => chooseChairs(1)}
                >
                  1 стул
                </button>
                <button
                  type="button"
                  aria-pressed={view.chairs === 2}
                  onClick={() => chooseChairs(2)}
                >
                  2 стула
                </button>
              </div>
              <button
                type="button"
                className="hud-text-button"
                onClick={findLadder}
              >
                <Search size={14} /> Поискать стремянку
              </button>
            </>
          )}
          {players > 1 && (
            <>
              {hold('KeyE', 'Никита · E держать / подать')}
              <div className="hud-button-grid">
                {hold('KeyA', 'A · баланс ←')}
                {hold('KeyD', 'D · баланс →')}
              </div>
            </>
          )}
          {hold(
            players === 1 ? 'KeyE' : 'Enter',
            `Ярик · ${players === 1 ? 'E' : 'Enter'} · ${view.drillMode === 'drill' ? 'сверлить' : view.drillMode === 'handoff' ? 'принять инструмент' : view.drillMode === 'descend' ? 'спуститься' : 'забраться'}`,
          )}
          {view.drillMode === 'drill' && (
            <>
              {hold(
                players === 1 ? 'ShiftLeft' : 'ShiftRight',
                'Shift · пылесосить одновременно',
              )}
              <div className="hud-button-grid">
                {hold(players === 1 ? 'KeyW' : 'ArrowUp', '↑ выше')}
                {hold(players === 1 ? 'KeyS' : 'ArrowDown', '↓ ниже')}
              </div>
              <Fill label="Отверстие" value={view.drill} />
              <Fill
                label="Нагрев · отпускай дрель для охлаждения"
                value={view.drillHeat}
                danger={view.drillHeat > 0.75}
              />
            </>
          )}
          {players === 3 && hold('KeyO', 'Рома · O страховать вместе')}
          <p className="hud-note">
            При падении готовые отверстия сохраняются. Заберись и получи дрель с
            пылесосом заново.
          </p>
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
            hint={players === 1 ? 'Ярик помогает' : '↑ / ↓'}
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
              Ярик повторяет подъём твоего края и ловит правый крючок вместе с
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
            {onNext ? 'В машину · дальше по городу' : 'К другим историям'}{' '}
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
