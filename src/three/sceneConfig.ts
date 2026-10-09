import { Vector3 } from 'three';

/** Scene-wide look constants: late golden hour sliding into dusk. */
export const FOG_COLOR = '#121a2b';
export const FOG_DENSITY = 0.0031;
export const SKY_BOTTOM = '#05080e';
export const EXPOSURE = 1.38;

/** Direction *towards* the sun (low in the south-west, so long shadows fall across the city). */
export const SUN_DIR = new Vector3(-0.62, 0.2, 0.76).normalize();
export const SUN_COLOR = '#ffbd80';
export const SUN_INTENSITY = 3.3;
