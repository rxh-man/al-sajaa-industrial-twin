import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { TwinMark } from '../ui/TwinMark';
import { PLACE } from '../../data/geo';
import { MapIntro } from './MapIntro';

const STEPS = [{ label: 'Building the city' }, { label: 'Laying pipes and cables' }, { label: 'Placing sensors' }, { label: 'Starting the twin' }];

/**
 * Short, honest loading sequence over a map of the UAE → zoom to Abu Dhabi Island and the
 * Al Danah street grid → hand over to the 3D twin's top-down shot → camera intro → operational UI.
 */
export function BootSequence() {
  const boot = useTwinStore((s) => s.boot);
  const sceneReady = useTwinStore((s) => s.sceneReady);
  const setBoot = useTwinStore((s) => s.setBoot);
  const requestShot = useTwinStore((s) => s.requestShot);
  const [step, setStep] = useState(0);
  const [zooming, setZooming] = useState(false);
  const [gone, setGone] = useState(false);
  const handedOver = useRef(false);

  useEffect(() => {
    if (boot !== 'loading') return;
    if (step < STEPS.length - 1) {
      const id = setTimeout(() => setStep((s) => s + 1), 340);
      return () => clearTimeout(id);
    }
    if (step === STEPS.length - 1 && sceneReady) {
      const id = setTimeout(() => setStep(STEPS.length), 320);
      return () => clearTimeout(id);
    }
  }, [step, sceneReady, boot]);

  // everything loaded → fly from the UAE down to the street grid
  useEffect(() => {
    if (step === STEPS.length && boot === 'loading') {
      const id = setTimeout(() => setZooming(true), 380);
      return () => clearTimeout(id);
    }
  }, [step, boot]);

  // the map ends on the twin's top-down view: fade it out, then start the camera intro
  const handOver = useCallback(() => {
    if (handedOver.current) return;
    handedOver.current = true;
    setBoot('intro');
    setTimeout(() => requestShot('intro'), 650);
  }, [setBoot, requestShot]);

  useEffect(() => {
    if (!zooming || boot !== 'loading') return;
    window.addEventListener('pointerdown', handOver, { once: true });
    window.addEventListener('keydown', handOver, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handOver);
      window.removeEventListener('keydown', handOver);
    };
  }, [zooming, boot, handOver]);

  useEffect(() => {
    if (boot !== 'intro') return;
    const id = setTimeout(() => setBoot('ready'), 3300);
    const skip = () => setBoot('ready');
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [boot, setBoot]);

  useEffect(() => {
    if (boot !== 'loading') {
      const id = setTimeout(() => setGone(true), 900);
      return () => clearTimeout(id);
    }
  }, [boot]);

  return (
    <>
      {!gone && (
        <div className={`loader ${boot !== 'loading' ? 'is-out' : ''} ${zooming ? 'is-zooming' : ''}`} aria-busy={boot === 'loading'}>
          <MapIntro play={zooming} onDone={handOver} />
          <div className="loader-card">
            <TwinMark size={46} className="loader-mark" />
            <div className="loader-title">Getting the city ready</div>
            <div className="loader-place">
              {PLACE.district} · {PLACE.city} · {PLACE.country}
            </div>
            <ul className="loader-steps">
              {STEPS.map((s, i) => (
                <li key={s.label} className={i < step ? 'is-done' : i === step ? 'is-active' : ''}>
                  <span className="loader-check">{i < step ? <Check size={12} strokeWidth={3} /> : <i />}</span>
                  <span className="loader-label">{s.label}</span>
                </li>
              ))}
            </ul>
            <div className="loader-bar">
              <i style={{ width: `${(step / STEPS.length) * 100}%` }} />
            </div>
          </div>
          {zooming && <div className="loader-skip">Click or press any key to skip</div>}
        </div>
      )}
      <div className={`intro-title ${boot === 'intro' ? 'is-on' : ''}`} aria-hidden={boot !== 'intro'}>
        <div className="intro-name">Al Sajaa Twin</div>
        <div className="intro-tag">Spots trouble under the city before it breaks.</div>
        <div className="intro-place">
          {PLACE.district} · {PLACE.city}
        </div>
      </div>
    </>
  );
}
