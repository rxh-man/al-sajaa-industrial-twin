import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace, SpriteMaterial } from 'three';

/**
 * A text label drawn into a canvas texture on a sprite. Used instead of drei <Html> for map labels: Html mounts a
 * separate React root and DOM node per label, and unmounting those while the scene re-renders produced
 * "removeChild" errors and "synchronously unmount a root" warnings. A sprite lives entirely in the WebGL scene;
 * its texture and material are disposed on unmount.
 */
export function LabelSprite({ text, position, border = '#ffffff55', scale = 1 }: { text: string; position: [number, number, number]; border?: string; scale?: number }) {
  const { mat, aspect } = useMemo(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const font = '600 28px Inter, system-ui, sans-serif';
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 28;
    c.width = Math.min(1024, w);
    c.height = 48;
    g.font = font;
    g.fillStyle = 'rgba(9,14,21,0.88)';
    g.strokeStyle = border;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(1.5, 1.5, c.width - 3, c.height - 3, 10);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.fillText(text, 14, c.height / 2 + 1);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return { mat: new SpriteMaterial({ map: tex, depthTest: false, transparent: true }), aspect: c.width / c.height };
  }, [text, border]);
  useEffect(
    () => () => {
      mat.map?.dispose();
      mat.dispose();
    },
    [mat],
  );
  return <sprite material={mat} position={position} scale={[aspect * 0.9 * scale, 0.9 * scale, 1]} renderOrder={30} raycast={() => {}} />;
}
