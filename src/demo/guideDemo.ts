import { useTwinStore } from '../store/useTwinStore';

/**
 * "Play the demo" for the resident guide (about one minute, under two):
 *   0 s   the 48-hour warning (simulated)
 *  12 s   the camera moves to Tasheel Centre and the Tasheel guide opens
 *  45 s   the medical guide opens to show the human handoff and emergency numbers
 *  60 s   the panels close
 * It only calls existing store actions. The pipe-failure timeline is not touched.
 */
let timers: number[] = [];

function at(ms: number, fn: () => void) {
  timers.push(window.setTimeout(fn, ms));
}

export function stopGuideDemo() {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
}

export function runGuideDemo() {
  stopGuideDemo();
  const s = useTwinStore.getState();
  s.requestShot('city');
  s.setFuture(true);
  at(12000, () => {
    const t = useTwinStore.getState();
    t.setFuture(false);
    t.focusPlace(84, 6, 16); // Tasheel Centre
  });
  at(15000, () => useTwinStore.getState().openService('Tasheel Centre'));
  at(45000, () => useTwinStore.getState().openService('Al Sajaa Hospital'));
  at(60000, () => {
    useTwinStore.getState().openService(null);
    timers = [];
  });
}
