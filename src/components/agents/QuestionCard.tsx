import { useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { useTwinStore } from '../../store/useTwinStore';
import { AGENT_BY_ID } from '../../agents/team';
import { COUNTDOWN_S, type Question } from '../../agents/brain';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * A question from the agents, as multiple choice. Their pick is marked; choices their rules rule out
 * are shown but can't be picked. Inside the operator's limits a countdown runs (paused while the
 * pointer or focus is on the card) and the agents go with their pick when it ends; otherwise the
 * clock waits for an answer.
 */
export function QuestionCard({ q, still }: { q: Question; still: boolean }) {
  const answer = useTwinStore((s) => s.answer);
  const setAutonomy = useTwinStore((s) => s.setAutonomy);
  const [left, setLeft] = useState(COUNTDOWN_S);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  heldRef.current = held;
  const agent = AGENT_BY_ID[q.agent];
  const pick = q.choices.findIndex((c) => c.id === q.recommended);

  // restart the countdown for each new question
  useEffect(() => {
    setLeft(COUNTDOWN_S);
    if (q.waits) return;
    let last = performance.now();
    let remaining = COUNTDOWN_S;
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (heldRef.current || document.hidden) return;
      remaining -= dt;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(id);
        answer(q.recommended, 'default');
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [q.id, q.waits, q.recommended, answer]);

  return (
    <section
      className={`qcard ${q.waits ? 'is-waiting' : 'is-timed'}`}
      role="alertdialog"
      aria-labelledby={`q-${q.id}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="qcard-kicker">
        <ThinkingOrb state={agent.orb} size={20} theme="dark" paused={still} aria-hidden="true" />
        <span>{agent.name} asks</span>
        <span className="qcard-count">
          {q.n} of {q.of}
        </span>
      </div>
      <h3 id={`q-${q.id}`}>{q.ask}</h3>
      <p className="qcard-context">{q.context}</p>
      <ol className="qcard-choices">
        {q.choices.map((c, i) => (
          <li key={c.id}>
            <button className={`qchoice ${c.id === q.recommended ? 'is-pick' : ''}`} disabled={!!c.off} onClick={() => answer(c.id)}>
              <span className="qchoice-letter" aria-hidden="true">
                {LETTERS[i]}
              </span>
              <span className="qchoice-text">
                <span className="qchoice-label">
                  {c.label}
                  {c.id === q.recommended && <span className="qchoice-tag">Our pick</span>}
                </span>
                <span className="qchoice-note">{c.off ? `Ruled out: ${c.off}` : c.note}</span>
                {c.warn && !c.off && <span className="qchoice-warn">{c.warn}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {q.waits ? (
        <div className="qcard-foot">
          <span>{q.why} Paused until you answer.</span>
          <button onClick={() => setAutonomy('full')}>Let the agents decide</button>
        </div>
      ) : (
        <div className="qcard-foot is-timer">
          <span className="qcard-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${left / COUNTDOWN_S})` }} />
          </span>
          <span>
            {held ? 'Paused while you read' : `Going with ${LETTERS[pick]} in ${Math.ceil(left)} s`}
            <button onClick={() => answer(q.recommended, 'you')}>Go with {LETTERS[pick]} now</button>
          </span>
        </div>
      )}
    </section>
  );
}
