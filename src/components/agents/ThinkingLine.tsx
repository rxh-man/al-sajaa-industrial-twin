import { useEffect, useRef, useState } from 'react';

type Line = { key: number; text: string; phase: 'enter' | 'in' | 'exit' };

/**
 * The agents' status line (transitions.dev "thinking states"): shimmers while a
 * state holds and swaps in place — old line up and out, new one in from below —
 * whenever the text changes.
 */
export function ThinkingLine({ text, live }: { text: string; live: boolean }) {
  const [lines, setLines] = useState<Line[]>([{ key: 0, text, phase: 'in' }]);
  const nextKey = useRef(1);

  useEffect(() => {
    setLines((prev) => {
      if (prev[prev.length - 1].text === text) return prev;
      return [...prev.filter((l) => l.phase !== 'exit').map((l) => ({ ...l, phase: 'exit' as const })), { key: nextKey.current++, text, phase: 'enter' }];
    });
  }, [text]);

  useEffect(() => {
    if (lines.every((l) => l.phase === 'in')) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setLines((ls) => ls.map((l) => (l.phase === 'enter' ? { ...l, phase: 'in' } : l))));
    });
    const done = setTimeout(() => setLines((ls) => ls.filter((l) => l.phase !== 'exit')), 260);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [lines]);

  return (
    <div className={`t-think agents-think ${live ? 'is-live' : ''}`} role="status" aria-live="polite">
      <span className="t-think-sizer" aria-hidden="true">
        {text}
      </span>
      {lines.map((l) => (
        <span key={l.key} className={`t-think-text ${l.phase === 'exit' ? 'is-exit' : ''} ${l.phase === 'enter' ? 'is-enter-start' : ''}`} data-text={l.text} aria-hidden={l.phase === 'exit'}>
          {l.text}
        </span>
      ))}
    </div>
  );
}
