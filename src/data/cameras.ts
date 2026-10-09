import type { ShotId } from '../simulation/engine';

export type Vec3 = [number, number, number];

export interface Pose {
  pos: Vec3;
  target: Vec3;
  duration: number;
}

export interface PathShot {
  path: Vec3[];
  targets: Vec3[];
  duration: number;
}

export const POSES: Record<Exclude<ShotId, 'dive' | 'follow'>, Pose> = {
  // straight down onto the slab, inland (−z) up: the opening map zoom ends on exactly this view
  intro: { pos: [0, 352, 15.5], target: [0, 0, 0], duration: 0 },
  city: { pos: [70, 96, 150], target: [4, -6, 4], duration: 2.4 },
  outro: { pos: [70, 96, 150], target: [4, -6, 4], duration: 5.2 },
  sector: { pos: [34, 33, 47], target: [2, 0, -10], duration: 2.8 },
  approach: { pos: [26, 21, 30], target: [2, -1.5, -2.8], duration: 2.6 },
  underground: { pos: [11, 19, 21], target: [0.5, -6.0, -2.2], duration: 2.4 },
  // above the ducts that run beside the water main under Khalifa Street, looking down onto the leak
  failure: { pos: [5.25, -1.38, 1.23], target: [1.3, -5.05, -2.4], duration: 2.4 },
  impact: { pos: [58, 112, 106], target: [0, -4, -12], duration: 3.0 },
  repairView: { pos: [38, 46, 60], target: [3, -2, -6], duration: 3.0 },
  valves: { pos: [11.0, -1.5, -0.6], target: [-3.5, -5.4, -2.4], duration: 2.6 },
  reroute: { pos: [36, 70, 44], target: [-2, -5, -17], duration: 2.4 },
  route: { pos: [102, 84, 62], target: [40, -3, -28], duration: 2.4 },
  exploded: { pos: [160, 98, 208], target: [4, -24, 8], duration: 2.6 },
};

/** Scripted descent: over the trench, into the cut, along the water main, onto the fracture. */
export const DIVE: PathShot = {
  path: [
    [26, 21, 30],
    [17, 8.5, 9],
    [11.2, -1.3, -0.4],
    [8.0, -1.75, 0.95],
    [5.25, -1.38, 1.23],
  ],
  targets: [
    [2, -1.5, -2.8],
    [4, -4.5, -2.4],
    [-1, -5.2, -2.4],
    [0.6, -5.1, -2.4],
    [1.3, -5.05, -2.4],
  ],
  duration: 4.5,
};

export const PRESET_LABELS: { id: 'city' | 'sector' | 'underground' | 'failure' | 'impact'; label: string; hint: string }[] = [
  { id: 'city', label: 'City', hint: 'Aerial overview' },
  { id: 'sector', label: 'Sector', hint: 'Focus on B-12' },
  { id: 'underground', label: 'Underground', hint: 'Cross-section view' },
  { id: 'failure', label: 'Failure', hint: 'Close-up of the pipe' },
  { id: 'impact', label: 'Impact', hint: 'Affected radius' },
];
