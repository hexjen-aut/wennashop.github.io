'use client';

import { useEffect, useState } from 'react';
import styles from './WennaPointer.module.css';

// Wenna qui se déplace jusqu'à l'élément mis en avant par un tutoriel et le
// pointe du bras. `rect` = getBoundingClientRect() de la cible (ou null).
// Elle part du coin du bouton d'aide, puis glisse d'une étape à l'autre.

const W = 72;
const H = Math.round((W * 280) / 240);
const MARGIN = 8;
const GAP = 10;
// Épaule du bras qui pointe, en coordonnées du viewBox (240×280).
const SHOULDER = { x: 190, y: 150 };

function placement(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Le panneau d'explication est en bas quand la cible est en haut, et
  // inversement : Wenna se place du côté opposé au panneau.
  let y;
  if (cy <= vh / 2) {
    y = rect.bottom + GAP;
    if (y + H > vh - MARGIN) y = rect.top - H - GAP;
  } else {
    y = rect.top - H - GAP;
    if (y < MARGIN) y = rect.bottom + GAP;
  }
  y = Math.min(Math.max(y, MARGIN), vh - H - MARGIN);

  // À gauche du centre de la cible si possible (elle pointe vers la droite),
  // sinon à droite (elle se retourne et pointe vers la gauche).
  // Décalée sur le côté pour que le bras pointe en diagonale, bien visible.
  let x = cx - W * 1.5;
  if (x < MARGIN) x = cx + W * 0.5;
  x = Math.min(Math.max(x, MARGIN), vw - W - MARGIN);

  const mirror = cx < x + W / 2;
  const shoulderX = x + (mirror ? 1 - SHOULDER.x / 240 : SHOULDER.x / 240) * W;
  const shoulderY = y + (SHOULDER.y / 280) * H;
  const dx = cx - shoulderX;
  const dy = cy - shoulderY;
  const angle = (Math.atan2(dy, mirror ? -dx : dx) * 180) / Math.PI;

  return { x, y, mirror, angle };
}

export default function WennaPointer({ rect }) {
  const [entered, setEntered] = useState(false);
  const hasRect = !!rect;

  useEffect(() => {
    document.documentElement.dataset.wennaTour = '1';
    return () => { delete document.documentElement.dataset.wennaTour; };
  }, []);

  // Premier rendu au coin du bouton d'aide, puis glissade vers la cible.
  useEffect(() => {
    if (!hasRect) { setEntered(false); return undefined; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, [hasRect]);

  if (!rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const start = { x: vw - W - 16, y: vh - H - (vw <= 768 ? 88 : 16), mirror: true, angle: -90 };
  const p = entered ? placement(rect) : start;

  return (
    <div className={styles.wrap} style={{ transform: `translate(${p.x}px, ${p.y}px)` }} aria-hidden="true">
      <div className={styles.bob}>
        <svg
          viewBox="0 0 240 280"
          width={W}
          height={H}
          className={styles.svg}
          style={{ transform: p.mirror ? 'scaleX(-1)' : 'none' }}
        >
          <defs>
            <clipPath id="wennaPtrTape"><rect x="102" y="70" width="36" height="34" rx="3" /></clipPath>
          </defs>
          <ellipse cx="120" cy="266" rx="70" ry="8" fill="#000" opacity=".18" />
          <rect x="88" y="214" width="16" height="30" rx="6" fill="#C98E52" />
          <rect x="136" y="214" width="16" height="30" rx="6" fill="#C98E52" />
          <path d="M70 252c0-11 9-18 22-18h10c8 0 12 6 12 13v5z" fill="#ff751f" />
          <rect x="68" y="250" width="48" height="10" rx="5" fill="#FFF4E8" />
          <path d="M126 252v-5c0-7 4-13 12-13h10c13 0 22 7 22 18z" fill="#ff751f" />
          <rect x="124" y="250" width="48" height="10" rx="5" fill="#FFF4E8" />
          <path d="M120 80c0-12 1-24-2-34" stroke="#8A5A2B" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M118 46c-6-14-22-20-40-16 6 14 22 20 40 16z" fill="#4E9A3F" />
          <path d="M118 46c8-14 26-18 42-12-8 14-26 18-42 12z" fill="#5FB04C" />
          <path d="M118 38c-2-10 2-18 10-22 2 10-2 18-10 22z" fill="#4E9A3F" />
          <rect x="44" y="76" width="160" height="146" rx="26" fill="#C98E52" />
          <rect x="36" y="70" width="160" height="146" rx="26" fill="#E2A96C" />
          <path d="M62 70h108c10 0 18 6 21 14H41c3-8 11-14 21-14z" fill="#EDBC84" />
          <g clipPath="url(#wennaPtrTape)">
            <rect x="102" y="70" width="36" height="34" fill="#ff751f" />
            <path d="M120 74l13 13-13 13-13-13z" stroke="#1A1410" strokeWidth="3.5" fill="none" />
            <path d="M120 81l6 6-6 6-6-6z" fill="#1A1410" />
          </g>
          <ellipse cx="42" cy="162" rx="13" ry="20" transform="rotate(18 42 162)" fill="#ff751f" />
          <path d="M68 112c6-6 16-7 24-3M140 109c8-4 18-3 24 3" stroke="#3A2416" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="82" cy="140" r="21" fill="#FFF" />
          <circle cx="84" cy="142" r="15" fill="#E8661A" />
          <circle cx="84" cy="142" r="10" fill="#2A1A10" />
          <circle cx="78" cy="135" r="5" fill="#FFF" />
          <circle cx="150" cy="140" r="21" fill="#FFF" />
          <circle cx="148" cy="142" r="15" fill="#E8661A" />
          <circle cx="148" cy="142" r="10" fill="#2A1A10" />
          <circle cx="142" cy="135" r="5" fill="#FFF" />
          <ellipse cx="66" cy="172" rx="10" ry="6" fill="#F28B5B" opacity=".45" />
          <ellipse cx="166" cy="172" rx="10" ry="6" fill="#F28B5B" opacity=".45" />
          <path d="M104 170c8 9 20 9 28 0" stroke="#3A2416" strokeWidth="5" strokeLinecap="round" fill="none" />
          {/* Bras qui pointe : tourné vers la cible autour de l'épaule. */}
          <g className={styles.arm} style={{ transform: `rotate(${p.angle.toFixed(1)}deg)` }}>
            <g className={styles.armTap}>
              <rect x={SHOULDER.x - 6} y={SHOULDER.y - 11} width="78" height="22" rx="11" fill="#ff751f" />
              <circle cx={SHOULDER.x + 76} cy={SHOULDER.y} r="16" fill="#ff751f" />
              <rect x={SHOULDER.x + 80} y={SHOULDER.y - 6} width="34" height="12" rx="6" fill="#ff751f" />
              <rect x={SHOULDER.x + 80} y={SHOULDER.y - 6} width="34" height="12" rx="6" fill="none" stroke="#C4520F" strokeWidth="2.5" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
