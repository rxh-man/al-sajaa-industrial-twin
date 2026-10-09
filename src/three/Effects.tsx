import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ToneMapping, N8AO, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { G } from './shaders/globals';

/** Ambient occlusion that steps aside while the surface turns to an X-ray ghost. */
function AmbientOcclusion() {
  const ref = useRef<{ configuration: { intensity: number } } | null>(null);
  useFrame(() => {
    const p = ref.current;
    if (!p) return;
    p.configuration.intensity = 2.6 * (1 - G.uXray.value * 0.85);
  });
  return <N8AO ref={ref as never} halfRes quality="medium" aoRadius={1.8} distanceFalloff={0.55} intensity={2.6} color="#0a0d14" />;
}

/** Contact shadows (AO), HDR bloom, soft vignette, ACES tone mapping and a light grade. */
export function Effects({ quality = 'high' }: { quality?: 'high' | 'low' }) {
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0} enableNormalPass={false}>
      {quality === 'high' && <AmbientOcclusion />}
      <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.22} intensity={0.85} radius={0.68} />
      <Vignette offset={0.28} darkness={0.5} eskil={false} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.06} />
      <BrightnessContrast contrast={0.05} />
    </EffectComposer>
  );
}
