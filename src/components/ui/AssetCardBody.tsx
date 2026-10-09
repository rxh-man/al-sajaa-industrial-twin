import type { AssetInfo } from '../../app/assetInfo';
import { StatusChip } from './StatusChip';

export function AssetCardBody({ data, compact = false }: { data: AssetInfo; compact?: boolean }) {
  const keyed = data.rows.filter((r) => r.key);
  const rows = compact ? (keyed.length ? keyed : data.rows.slice(0, 2)) : data.rows;
  return (
    <div className={`asset ${compact ? 'is-compact' : ''}`} style={data.color ? ({ ['--asset-c' as string]: data.color } as React.CSSProperties) : undefined}>
      <div className="asset-head">
        <span className="asset-kicker">
          {data.color && <span className="asset-swatch" />}
          {data.kicker}
        </span>
        <StatusChip tone={data.tone === 'info' ? 'info' : data.tone}>{data.status}</StatusChip>
      </div>
      <div className="asset-title">{data.title}</div>
      {data.subtitle && !compact && <div className="asset-sub">{data.subtitle}</div>}
      <dl className="asset-rows">
        {rows.map((r) => (
          <div key={r.label} className={`asset-row ${r.tone ? `t-${r.tone}` : ''}`}>
            <dt>{r.label}</dt>
            <dd className={r.mono ? 'mono tnum' : 'tnum'}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
