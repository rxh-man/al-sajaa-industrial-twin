import { useState } from 'react';
import { X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { SERVICE_BY_PLACE } from '../../data/serviceGuide';
import { UNVERIFIED_PLACES } from '../../data/verification';

/**
 * Resident Service Guide panel. Opens when a civic building is clicked on the map.
 * Steps: what the service is, a one-question-at-a-time eligibility check, a document checklist the
 * resident ticks off, draft answers to review, and where to submit. Nothing is sent anywhere.
 */
export function ServiceGuide() {
  const place = useTwinStore((s) => s.serviceFor);
  const openService = useTwinStore((s) => s.openService);
  const service = place ? SERVICE_BY_PLACE.get(place) : undefined;
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<(boolean | null)[]>([]);
  const [ticked, setTicked] = useState<boolean[]>([]);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  // reset the per-service state whenever a different building is opened
  if (place !== current) {
    setCurrent(place);
    setQi(0);
    setAnswers([]);
    setTicked([]);
    setDrafts([]);
  }

  if (!service) return null;
  const q = service.eligibility[qi];
  const answered = answers.length > 0 ? answers[answers.length - 1] : null;
  const failedAt = answers.findIndex((a) => a === false);
  const eligibleSoFar = failedAt === -1;
  const done = qi >= service.eligibility.length;

  const answer = (yes: boolean) => {
    const next = [...answers, yes];
    setAnswers(next);
    setQi(qi + 1);
  };

  return (
    <aside className="service-guide panel-enter" aria-label={service.title} role="dialog">
      <header className="sg-head">
        <div>
          <p className="sg-kicker">Resident service guide</p>
          <h2>{service.title}</h2>
        </div>
        <button className="sg-close" onClick={() => openService(null)} aria-label="Close service guide">
          <X size={16} />
        </button>
      </header>

      <p className="sg-status" role="note">
        <strong>Location status:</strong>{' '}
        {UNVERIFIED_PLACES.has(service.place)
          ? 'Location unverified'
          : 'Placed in the Al Sajaa baseline layout (procedural, not survey data)'}
        . <strong>Information only:</strong> verify with the relevant authority. This guide does not submit anything.
      </p>

      {service.emergency && <p className="sg-emergency">{service.emergency}</p>}

      <section>
        <h3>1. What this is</h3>
        <p>{service.what}</p>
      </section>

      <section>
        <h3>2. Quick eligibility check</h3>
        {!done && q && (
          <div className="sg-question">
            <p>
              <strong>Question {qi + 1} of {service.eligibility.length}:</strong> {q.q}
            </p>
            <div className="sg-buttons">
              <button onClick={() => answer(true)}>Yes</button>
              <button onClick={() => answer(false)}>No</button>
            </div>
          </div>
        )}
        {done && (
          <p className={eligibleSoFar ? 'sg-ok' : 'sg-warn'}>
            {eligibleSoFar
              ? 'Your answers suggest you can start. The office confirms the final decision.'
              : service.eligibility[failedAt].noAdvice}
          </p>
        )}
        {answers.length > 0 && !done && answered === false && <p className="sg-warn">{service.eligibility[qi - 1].noAdvice}</p>}
      </section>

      <section>
        <h3>3. Documents you need</h3>
        <ul className="sg-checklist">
          {service.checklist.map((item, i) => (
            <li key={item}>
              <label>
                <input
                  type="checkbox"
                  checked={!!ticked[i]}
                  onChange={(e) => {
                    const next = [...ticked];
                    next[i] = e.target.checked;
                    setTicked(next);
                  }}
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="sg-meta">
          Ticked: {ticked.filter(Boolean).length} of {service.checklist.length}
        </p>
      </section>

      <section>
        <h3>4. Prepare your answers</h3>
        <p className="sg-meta">Drafts stay in this panel only. Review them before you use them anywhere.</p>
        {service.drafts.map((d, i) => (
          <label key={d.label} className="sg-field">
            <span>{d.label}</span>
            <textarea
              rows={3}
              placeholder={d.hint}
              value={drafts[i] ?? ''}
              onChange={(e) => {
                const next = [...drafts];
                next[i] = e.target.value;
                setDrafts(next);
              }}
            />
          </label>
        ))}
        <p className="sg-meta">Do not type passwords, bank details or full ID numbers here.</p>
      </section>

      <section>
        <h3>5. When to hand off to a person</h3>
        <p>
          This guide explains the steps. It cannot decide your legal case or give a medical diagnosis, and it cannot submit anything for you.
        </p>
        <ul>
          <li>Legal questions: a qualified lawyer, or the court’s official help desk.</li>
          <li>Medical questions: the clinic or doctor. For an emergency, call 998 (ambulance, emergency number) now.</li>
          <li>Anything with a police or safety risk: call 999 (police, emergency number) now.</li>
        </ul>
      </section>

      <section>
        <h3>6. Official route: verify before you go</h3>
        <ol>
          {service.submit.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="sg-warn">Official route not verified. Check the relevant authority.</p>
        <p className="sg-verify">{service.verify}</p>
      </section>
    </aside>
  );
}
