/**
 * Sharjah Smart City logo. The artwork has its own white background, so it sits on a white
 * plate: the gold mark and the dark wordmark stay readable on the dark twin and landing pages.
 */
export function BrandLogo({ height = 40, className = '' }: { height?: number; className?: string }) {
  return (
    <span className={`brand-logo ${className}`} style={{ height: height + 8 }}>
      <img src="/sharjah-smart-city-logo.png" alt="Sharjah Smart City" style={{ height }} draggable={false} />
    </span>
  );
}
