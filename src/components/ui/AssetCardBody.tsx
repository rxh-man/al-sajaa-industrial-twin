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
      {data.series && (
        <figure className="asset-series" aria-label={data.series.label}>
          <figcaption>
            {data.series.label} <small>({data.series.unit})</small>
          </figcaption>
          <div className="asset-bars">
            {data.series.values.map((v, i) => (
              <span key={data.series!.labels[i]} title={`${data.series!.labels[i]}: ${v}`} style={{ height: `${Math.max(4, v)}%` }} />
            ))}
          </div>
          <div className="asset-bar-axis">
            <span>{data.series.labels[0]}</span>
            <span>{data.series.labels[data.series.labels.length - 1]}</span>
          </div>
        </figure>
      )}
    </div>
  );
}
