import type { Layer } from './useAiLights';

/** The glow layers, each drawn twice (the second mirrored): one copy alone lights only one side. */
export function RimGlow({ layers }: { layers: Layer[] }) {
  return (
    <>
      {layers.map((l, i) =>
        [0, 1].map((side) => (
          <span
            key={`${i}-${side}`}
            aria-hidden="true"
            className="ai-lights-layer"
            style={{
              inset: `${-l.pad}px`,
              maskImage: `url(${l.mask})`,
              WebkitMaskImage: `url(${l.mask})`,
              transform: side ? 'scaleX(-1)' : undefined,
            }}
          />
        )),
      )}
    </>
  );
}
