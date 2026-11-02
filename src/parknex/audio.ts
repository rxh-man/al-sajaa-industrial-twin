import { usePark } from './store';

/**
 * Optional voice: announcements through the browser's speech synthesis, only when the operator has switched
 * audio on (off by default). Every announcement is also kept as visible text for the panel.
 */
export const LOG: string[] = [];

export function announce(text: string) {
  LOG.unshift(`${new Date().toLocaleTimeString()} · ${text}`);
  LOG.length = Math.min(LOG.length, 20);
  if (!usePark.getState().audio || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.lang = 'en-GB';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/** browser speech recognition (Chrome/Edge); null where unsupported */
export function recognise(onText: (t: string) => void, onEnd: () => void) {
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = 'en-US';
  r.interimResults = false;
  r.onresult = (e) => onText(e.results[0][0].transcript);
  r.onend = onEnd;
  r.start();
  return r;
}
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: { 0: { transcript: string } }[] }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
