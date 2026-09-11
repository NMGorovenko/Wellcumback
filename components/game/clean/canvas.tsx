/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Canvas renders a dynamic interactive game, with text alternatives in the HUD. */
'use client';
import { useEffect, useRef, type RefObject } from 'react';
import type { CleanState } from '@/lib/game/clean/engine';
import { stations } from '@/lib/game/clean/engine';
import { people } from '@/lib/game/presets';
export default function CleanCanvas({ game }: { game: RefObject<CleanState> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    const box = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    const text = (
      t: string,
      x: number,
      y: number,
      size = 12,
      color = '#dae7bd',
    ) => {
      ctx.font = `bold ${size}px monospace`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(t, x, y);
    };
    const render = () => {
      frame = requestAnimationFrame(render);
      const s = game.current;
      ctx.clearRect(0, 0, 920, 520);
      box(0, 0, 920, 520, '#263428');
      box(35, 40, 850, 430, '#596c51');
      box(50, 55, 820, 165, '#6d7d5d');
      box(50, 225, 820, 225, '#a7ac85');
      // The barracks' collision-free central aisle is the playable area.
      for (let x = 55; x < 870; x += 35) {
        box(x, 225, 1, 225, '#919a71');
      }
      for (let y = 235; y < 450; y += 35) box(50, y, 820, 1, '#939b74');
      for (let i = 0; i < 7; i++) {
        const x = 80 + i * 110;
        box(x + 4, 86, 72, 95, '#354839');
        box(x, 80, 72, 95, '#c6c7a3');
        box(x + 4, 104, 64, 68, i % 2 ? '#7f9774' : '#6e8463');
        box(x + 8, 85, 56, 19, '#e3dfbf');
        box(x + 33, 109, 3, 57, '#adbd96');
        box(x - 4, 76, 5, 102, '#344438');
        box(x + 71, 76, 5, 102, '#344438');
      }
      box(35, 210, 850, 12, '#354936');
      box(425, 206, 85, 20, '#a7ac85');
      text('ДРУГАЯ РОТА · НЕ РОМИНА', 465, 33, 13);
      text('СПАЛЬНОЕ РАСПОЛОЖЕНИЕ', 465, 199, 11, '#344732');
      box(80, 365, 135, 77, '#8ea59a');
      box(85, 370, 125, 65, '#b6c2ac');
      text('ДУШ', 145, 425, 15, '#41594c');
      box(128, 371, 34, 9, '#688a7d');
      box(140, 375, 7, 21, '#789689');
      const shake = s.phase === 'clean' ? Math.sin(s.machine * 30) * 3 : 0;
      box(755 + shake, 365, 92, 76, '#ede8c7');
      box(762 + shake, 370, 78, 13, '#c5c5a0');
      ctx.strokeStyle = '#607465';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(802 + shake, 409, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#829b84';
      ctx.beginPath();
      ctx.arc(802 + shake, 409, 16, 0, Math.PI * 2);
      ctx.fill();
      if (s.phase === 'clean') {
        ctx.strokeStyle = '#e9edda';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(802 + shake, 409, 12, s.machine * 8, s.machine * 8 + 3.8);
        ctx.stroke();
      }
      text('СТИРАЛКА', 804, 357, 11, '#364e38');
      box(757, 236, 80, 49, '#775e3b');
      box(752, 230, 90, 14, '#b49b68');
      text('ДНЕВАЛЬНЫЙ', 797, 219, 10);
      box(798, 189, 20, 34, '#3d593d');
      box(801, 177, 15, 17, '#d3b183');
      box(798, 175, 22, 7, '#334b32');
      if (s.phase === 'clean' || s.phase === 'result') {
        for (const spot of s.spots) {
          if (spot.progress >= 1) {
            text('✦', spot.x, spot.y, 20, '#edf2d4');
            continue;
          }
          ctx.globalAlpha = 1 - spot.progress * 0.8;
          ctx.fillStyle = '#677344';
          ctx.beginPath();
          ctx.ellipse(
            spot.x,
            spot.y,
            27 * (1 - spot.progress * 0.4),
            13,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.strokeStyle = '#b6c08e';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(spot.x, spot.y - 3, 7, 0, Math.PI);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      const target =
        s.phase === 'find'
          ? stations[0]
          : s.phase === 'wash'
            ? stations[s.station]
            : null;
      if (target) {
        ctx.strokeStyle = '#e1f496';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(target.x - 46, target.y - 40, 92, 80);
        ctx.setLineDash([]);
        text('↓ E', target.x, target.y - 52, 15, '#edfac4');
      }
      for (let i = 0; i < s.players; i++) {
        const x = s.x[i],
          y = s.y[i],
          hazmat = s.phase === 'clean' || s.phase === 'result';
        ctx.fillStyle = '#263e3655';
        ctx.beginPath();
        ctx.ellipse(x, y + 15, 17, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        box(x - 9, y + 2, 7, 13, '#33453a');
        box(x + 3, y + 2, 7, 13, '#33453a');
        box(x - 12, y - 20, 25, 26, hazmat ? '#b6c284' : people[i].color);
        box(x - 10, y - 39, 22, 22, hazmat ? '#c0cc8e' : people[i].skin);
        box(x - 9, y - 36, 20, 7, hazmat ? '#304b43' : people[i].hair);
        if (hazmat) box(x - 5, y - 30, 11, 10, '#3b554c');
        else {
          box(x - 5, y - 28, 3, 3, '#263c31');
          box(x + 4, y - 28, 3, 3, '#263c31');
        }
        if (hazmat) {
          box(x + 18, y - 10, 4, 32, '#755f39');
          box(x + 8, y + 17, 25, 7, '#d7d6ab');
        }
        text(people[i].name, x, y - 50, 11, '#f3f2d7');
      }
      if (s.phase === 'clean') {
        text('ХИМЗАЩИТА: АКТИВНА', 460, 488, 12, '#dce8a9');
      } else
        text('«ТОВАРИЩ ДНЕВАЛЬНЫЙ, У МЕНЯ ВОПРОС…»', 460, 488, 12, '#dce8a9');
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [game]);
  return (
    <canvas
      className="clean-canvas"
      ref={canvas}
      width={920}
      height={520}
      role="img"
      aria-label="2D-казарма: кровати, дневальный справа, душ слева и стиральная машина справа внизу"
    />
  );
}
