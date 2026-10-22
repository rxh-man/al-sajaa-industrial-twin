/**
 * SIMULATED 48-hour outlook for the twin. Every item is generated for the demo, not taken from a
 * real utility, municipality or weather feed. The UI labels all of it as simulated.
 */
export const FORECAST_IS_SIMULATED = true as const;

export interface ForecastItem {
  id: string;
  kind: 'pressure' | 'power' | 'road' | 'closure' | 'heat';
  title: string;
  /** hours from now when it is expected to start */
  startsInH: number;
  affects: string[];
  /** plain-language notice for residents, general guidance only */
  notice: string;
}

export const FORECAST_48H: ForecastItem[] = [
  {
    id: 'pressure-drop',
    kind: 'pressure',
    title: 'Water pressure drop, main road (simulated)',
    startsInH: 14,
    affects: ['Labor Camp', 'Car Auction Yard'],
    notice: 'Water pressure may drop for a few hours while a valve is serviced. Store some drinking water in advance.',
  },
  {
    id: 'power-works',
    kind: 'power',
    title: 'Planned power works, north district',
    startsInH: 30,
    affects: ['Community School', 'Community Museum'],
    notice: 'A planned power cut may last about two hours. Check the official utility notice before you plan around it.',
  },
  {
    id: 'road-works',
    kind: 'road',
    title: 'Road works on the Emirates Road E611 service lane',
    startsInH: 22,
    affects: ['Tasheel Centre', 'Etihad Rail Station'],
    notice: 'One service lane may be narrowed. Allow extra travel time and follow the signs on site.',
  },
  {
    id: 'service-closure',
    kind: 'closure',
    title: 'Typing counter closed for a half day',
    startsInH: 40,
    affects: ['Tasheel Centre'],
    notice: 'The counter may close early on the day shown. Confirm the hours with the centre before you go.',
  },
  {
    id: 'heat-risk',
    kind: 'heat',
    title: 'Heat stress risk, afternoon',
    startsInH: 26,
    affects: ['Labor Camp', 'Car Auction Yard'],
    notice: 'Heat stress risk is high in the afternoon. General guidance: work in the shade where possible, drink water often and take regular rest breaks.',
  },
];
