import { useId, useMemo } from 'react';

interface Props {
  values: number[];
  color: string;
  height?: number;
  width?: number;
  /** fixed domain so small changes are not exaggerated */
  domain?: [number, number];
}

export function Sparkline({ values, color, height = 34, width = 120, domain }: Props) {
  const id = useId().replace(/:/g, '');
  const { line, area, last } = useMemo(() => {
    if (values.length < 2) return { line: '', area: '', last: [0, 0] as [number, number] };
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (domain) {
      lo = Math.min(lo, domain[0]);
      hi = Math.max(hi, domain[1]);
    }
    const span = Math.max(1e-6, hi - lo);
    const pad = 3;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + (1 - (v - lo) / span) * (height - pad * 2);
      return [x, y] as [number, number];
    });
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const area = `${line}L${width},${height}L0,${height}Z`;
    return { line, area, last: pts[pts.length - 1] };
  }, [values, height, width, domain]);

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} className="sparkline-head" />
    </svg>
  );
}
