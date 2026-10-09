/** Demo field crews on shift. Made-up people and numbers, like the rest of the twin. */
export type Skill = 'water-main' | 'water-service' | 'electric' | 'sewage';

export interface Crew {
  id: string;
  name: string;
  people: number;
  skills: Skill[];
  minutesAway: number;
  /** Set when the crew is already on another job. */
  busy?: string;
}

export const CREWS: Crew[] = [
  { id: '07', name: 'Crew 07', people: 4, skills: ['water-main', 'water-service'], minutesAway: 18 },
  { id: '03', name: 'Crew 03', people: 5, skills: ['water-main'], minutesAway: 9, busy: 'On another repair for 2 more hours' },
  { id: '11', name: 'Crew 11', people: 3, skills: ['water-service'], minutesAway: 6 },
  { id: '15', name: 'Crew 15', people: 3, skills: ['electric'], minutesAway: 9 },
  { id: '22', name: 'Crew 22', people: 4, skills: ['sewage'], minutesAway: 14 },
];

export const PEOPLE_ON_SHIFT = CREWS.reduce((sum, c) => sum + c.people, 0);
