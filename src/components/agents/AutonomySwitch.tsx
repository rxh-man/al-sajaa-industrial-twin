import { useLayoutEffect, useRef } from 'react';
import { useTwinStore } from '../../store/useTwinStore';
import { SPEND_LIMITS, type Autonomy } from '../../agents/brain';
import { formatMoney } from '../../data/incident';

const OPTIONS: { id: Autonomy; label: string; hint: string }[] = [
  { id: 'full', label: 'Full auto', hint: 'Agents decide and act on everything. You get the report.' },
  { id: 'limits', label: 'With limits', hint: 'Agents act alone inside your limits and only ask when nothing fits.' },
  { id: 'ask', label: 'Ask me', hint: 'Agents plan the repair, then wait for your OK.' },
];

/** Sliding segmented control (transitions.dev "tabs sliding"): JS measures, CSS tweens. */
export function AutonomySwitch() {
  const policy = useTwinStore((s) => s.policy);
  const setAutonomy = useTwinStore((s) => s.setAutonomy);
  const setSpendLimit = useTwinStore((s) => s.setSpendLimit);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabs = useRef<Partial<Record<Autonomy, HTMLButtonElement | null>>>({});
  const placed = useRef(false);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const tab = tabs.current[policy.autonomy];
    if (!pill || !tab) return;
    const moveTo = (animate: boolean) => {
      if (!animate) {
        const prev = pill.style.transition;
        pill.style.transition = 'none';
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
        void pill.offsetWidth;
        pill.style.transition = prev;
      } else {
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
      }
    };
    moveTo(placed.current);
    placed.current = true;
    const onResize = () => moveTo(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [policy.autonomy]);

  const current = OPTIONS.find((o) => o.id === policy.autonomy)!;

  return (
    <div className="autonomy">
      <div className="t-tabs" role="tablist" aria-label="How much the agents can do alone" title={current.hint}>
        <span className="t-tabs-pill" aria-hidden="true" ref={pillRef} />
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            ref={(el) => {
              tabs.current[o.id] = el;
            }}
            className="t-tab"
            role="tab"
            aria-selected={policy.autonomy === o.id}
            onClick={() => setAutonomy(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {policy.autonomy === 'limits' && (
        <div className="limits" role="group" aria-label="Spending limit">
          <span>Spend alone up to</span>
          {SPEND_LIMITS.map((v) => (
            <button key={v} className="limit-chip" aria-pressed={policy.spendLimit === v} onClick={() => setSpendLimit(v)}>
              {formatMoney(v)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
