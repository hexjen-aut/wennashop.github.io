'use client';

import { useEffect, useRef, useState } from 'react';
import s from './LineChart.module.css';

// Courbes dans le temps pour l'admin : grille légère, axe des montants, point
// et bulle au survol (souris ou doigt), tableau des chiffres à la demande.
// labels : une étiquette par point (ex. mois) ;
// series : [{ key, label, color, values }] — une seule série = pas de légende,
// le titre de la carte la nomme. Couleurs validées sur la surface sombre :
// #e65100 (orange) puis #3987e5 (bleu), dans cet ordre.

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

// Pas « rond » (1, 2, 2,5, 5, 10 × 10ⁿ) pour environ 4 graduations ; jamais
// sous 1 pour des comptes entiers (pas de « 6,3 » acheteurs).
function niceStep(max) {
  const raw = Math.max(max / 4, 1);
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export default function LineChart({ labels, series, format = (v) => String(v), height = 210, ariaLabel }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((x) => x.values);
  if (!all.some((v) => v > 0)) return <div className={s.empty}>Aucune donnée sur la période</div>;

  const multi = series.length > 1;
  const m = { top: 14, right: multi ? 84 : 24, bottom: 28, left: 52 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const step = niceStep(Math.max(...all));
  const max = step * Math.ceil(Math.max(...all) / step);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const n = labels.length;
  const x = (i) => (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v) => h - (v / max) * h;

  // Étiquettes directes en bout de courbe, écartées si elles se chevauchent.
  const ends = series
    .map((sr) => ({ key: sr.key, label: sr.label, color: sr.color, y: y(sr.values[n - 1] || 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) {
    if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  }

  function pick(clientX) {
    const r = wrapRef.current.getBoundingClientRect();
    const px = clientX - r.left - m.left;
    const i = n > 1 ? Math.round((px / w) * (n - 1)) : 0;
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const tipLeft = hover === null ? 0 : Math.min(Math.max(m.left + x(hover), 90), width - 90);

  return (
    <div>
      {multi && (
        <div className={s.legend}>
          {series.map((sr) => (
            <span key={sr.key} className={s.legendItem}>
              <span className={s.legendLine} style={{ background: sr.color }} />{sr.label}
            </span>
          ))}
        </div>
      )}
      <div ref={wrapRef} className={s.wrap} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            <g transform={`translate(${m.left},${m.top})`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={w} y1={y(t)} y2={y(t)} className={t === 0 ? s.baseline : s.grid} />
                  <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className={s.axis}>{compact.format(t)}</text>
                </g>
              ))}
              {labels.map((l, i) => (
                <text key={l + i} x={x(i)} y={h + 18} textAnchor="middle" className={s.axis}>{l}</text>
              ))}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} className={s.cross} />}
              {series.map((sr) => (
                <g key={sr.key}>
                  <polyline
                    points={sr.values.map((v, i) => `${x(i)},${y(v || 0)}`).join(' ')}
                    fill="none" stroke={sr.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                  />
                  {sr.values.map((v, i) => (
                    <circle key={i} cx={x(i)} cy={y(v || 0)} r={hover === i ? 5 : 4} fill={sr.color} className={s.dot} />
                  ))}
                </g>
              ))}
              {multi
                ? ends.map((e) => (
                  <text key={e.key} x={w + 10} y={e.y} dy="0.32em" className={s.endLabel}>{e.label}</text>
                ))
                : (
                  <text x={x(n - 1)} y={y(series[0].values[n - 1] || 0) - 12} textAnchor="end" className={s.endLabel}>
                    {format(series[0].values[n - 1] || 0)}
                  </text>
                )}
              <rect
                x={0} y={0} width={w} height={h} fill="transparent"
                onPointerMove={(e) => pick(e.clientX)}
                onPointerDown={(e) => pick(e.clientX)}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          </svg>
        )}
        {hover !== null && (
          <div className={s.tip} style={{ left: tipLeft }}>
            <div className={s.tipTitle}>{labels[hover]}</div>
            {series.map((sr) => (
              <div key={sr.key} className={s.tipRow}>
                <span className={s.legendLine} style={{ background: sr.color }} />
                <span className={s.tipLabel}>{sr.label}</span>
                <span className={s.tipValue}>{format(sr.values[hover] || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button type="button" className={s.tableToggle} onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Masquer les chiffres' : 'Voir les chiffres'}
      </button>
      {showTable && (
        <table className={s.table}>
          <thead>
            <tr><th>Mois</th>{series.map((sr) => <th key={sr.key}>{sr.label}</th>)}</tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l + i}><td>{l}</td>{series.map((sr) => <td key={sr.key}>{format(sr.values[i] || 0)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
