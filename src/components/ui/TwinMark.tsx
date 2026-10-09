/**
 * Twin mark: three blocks on a ground line (currentColor) with a pipe run beneath them and one
 * amber sensor node. Kept under the old export name so existing imports still resolve.
 */
const PIPE = '#4fd1c5';
const NODE = '#f2b441';

export function TwinMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  const sw = Math.max(6, (1.6 * 100) / size);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g stroke="currentColor" strokeWidth={sw}>
        <path d="M10 66H90" />
        <path d="M22 66V38H40V66" />
        <path d="M46 66V22H62V66" />
        <path d="M68 66V44H82V66" />
      </g>
      <path d="M10 82H90" stroke={PIPE} strokeWidth={sw * 1.2} />
      <path d="M46 82V92" stroke={PIPE} strokeWidth={sw * 1.2} />
      <circle cx={46} cy={82} r={Math.max(5, sw * 1.3)} fill={NODE} />
    </svg>
  );
}
