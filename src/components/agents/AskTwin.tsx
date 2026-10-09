import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { askAgents, type factsNow } from '../../agents/ask';
import { ThinkingLine } from './ThinkingLine';

const SUGGESTIONS = ['Why this fix?', 'Why Crew 07?', 'Is the hospital OK?'];

/** Ask the agents about what they did. Answers come from Qwen using only the run's facts. */
export function AskTwin({ facts, chips = true }: { facts: () => ReturnType<typeof factsNow>; chips?: boolean }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ q: string; answer: string; by: 'qwen' | 'built-in' } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setQ('');
    try {
      const r = await askAgents(text, facts(), c.signal);
      setReply({ q: text, ...r });
    } catch {
      // a newer question replaced this one
    } finally {
      if (ctrl.current === c) setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(q);
  };

  return (
    <section className="ask" aria-label="Ask the agents">
      <form className="ask-box" onSubmit={submit}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the agents anything…" maxLength={300} aria-label="Question for the agents" />
        <button type="submit" disabled={!q.trim() || busy} aria-label="Ask">
          <ArrowUp size={15} strokeWidth={2.4} />
        </button>
      </form>
      {chips && !reply && !busy && (
        <div className="ask-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => void ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {busy && <ThinkingLine text="Al Sajaa Twin is thinking…" live />}
      {reply && !busy && (
        <div className="ask-reply" aria-live="polite">
          <p className="ask-q">{reply.q}</p>
          <p className="ask-a">{reply.answer}</p>
          <div className="ask-meta">
            <span>{reply.by === 'qwen' ? 'Written by Qwen from the agents’ facts' : 'Built-in answer (Qwen offline)'}</span>
            <button type="button" onClick={() => setReply(null)}>
              Clear
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
