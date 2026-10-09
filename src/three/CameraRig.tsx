import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import { Box3, CatmullRomCurve3, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { useTwinStore } from '../store/useTwinStore';
import { POSES, DIVE, type Vec3 } from '../data/cameras';
import { crewCam } from '../simulation/crew';

type Tween =
  | { kind: 'pose'; fromPos: Vector3; fromTgt: Vector3; toPos: Vector3; toTgt: Vector3; t0: number; dur: number; ease: (u: number) => number }
  | { kind: 'path'; pos: CatmullRomCurve3; tgt: CatmullRomCurve3; t0: number; dur: number }
  | { kind: 'follow'; fromPos: Vector3; fromTgt: Vector3; pos: Vector3; tgt: Vector3; yaw: number; t0: number };

/** Chase camera on the crew truck: behind, above, looking a little ahead of it. */
const FOLLOW = { back: 3.5, up: 30, ahead: 3, blendIn: 1.6 };

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const easeInOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;

const v = (a: Vec3) => new Vector3(a[0], a[1], a[2]);

const s0 = new Spherical();
const s1 = new Spherical();
const off = new Vector3();
const tmpPos = new Vector3();
const tmpTgt = new Vector3();

export interface ViewInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const viewInsets: ViewInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const tween = useRef<Tween | null>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  // own time base: robust to clock resets and long pauses (hidden tabs)
  const now = useRef(0);

  // limits that keep people oriented
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.minDistance = 2.5;
    c.maxDistance = 360;
    c.minPolarAngle = 0.04;
    c.maxPolarAngle = Math.PI * 0.492;
    c.smoothTime = 0.32;
    c.draggingSmoothTime = 0.1;
    c.azimuthRotateSpeed = 0.55;
    c.polarRotateSpeed = 0.55;
    c.dollySpeed = 0.6;
    c.truckSpeed = 1.6;
    c.dollyToCursor = true;
    c.infinityDolly = false;
    c.setBoundary(new Box3(new Vector3(-96, -48, -86), new Vector3(96, 26, 104)));
    c.boundaryEnclosesCamera = false;
    const p = POSES.intro;
    c.setLookAt(...p.pos, ...p.target, false);
    const stop = () => {
      tween.current = null;
    };
    c.addEventListener('controlstart', stop);
    if (import.meta.env.DEV) (window as unknown as { __cc: unknown }).__cc = c;
    return () => c.removeEventListener('controlstart', stop);
  }, []);

  // respond to shot requests
  useEffect(() => {
    const unsub = useTwinStore.subscribe((s, prev) => {
      if (s.shot.nonce === prev.shot.nonce) return;
      startShot(s.shot.id);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startShot(id: string) {
    const c = ref.current;
    if (!c) return;
    c.getPosition(tmpPos);
    c.getTarget(tmpTgt);
    const t0 = now.current;
    if (id === 'follow') {
      tween.current = { kind: 'follow', fromPos: tmpPos.clone(), fromTgt: tmpTgt.clone(), pos: tmpPos.clone(), tgt: tmpTgt.clone(), yaw: crewCam.yaw, t0 };
      return;
    }
    if (id === 'dive') {
      const pos = new CatmullRomCurve3([tmpPos.clone(), ...DIVE.path.slice(1).map(v)], false, 'centripetal', 0.5);
      const tgt = new CatmullRomCurve3([tmpTgt.clone(), ...DIVE.targets.slice(1).map(v)], false, 'centripetal', 0.5);
      tween.current = { kind: 'path', pos, tgt, t0, dur: DIVE.duration };
      return;
    }
    const pose = POSES[id as keyof typeof POSES];
    if (!pose) return;
    const dur = id === 'intro' ? 4.6 : pose.duration;
    const ease = id === 'intro' ? easeOut : id === 'outro' ? easeInOutSine : easeInOut;
    const from = id === 'intro' ? v(POSES.intro.pos) : tmpPos.clone();
    const fromT = id === 'intro' ? v(POSES.intro.target) : tmpTgt.clone();
    const to = id === 'intro' ? v(POSES.city.pos) : v(pose.pos);
    const toT = id === 'intro' ? v(POSES.city.target) : v(pose.target);
    tween.current = { kind: 'pose', fromPos: from, fromTgt: fromT, toPos: to, toTgt: toT, t0, dur, ease };
  }

  useFrame((_, delta) => {
    now.current += Math.min(delta, 0.1);
    const c = ref.current;
    const tw = tween.current;
    if (!c || !tw) return;
    if (tw.kind === 'follow') {
      const dt = Math.min(delta, 0.1);
      // the camera's heading trails the truck's so corners turn into smooth sweeps
      let dy = crewCam.yaw - tw.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      tw.yaw += dy * (1 - Math.exp(-dt * 2.2));
      const fx = Math.sin(tw.yaw);
      const fz = Math.cos(tw.yaw);
      tmpPos.set(crewCam.x - fx * FOLLOW.back, FOLLOW.up, crewCam.z - fz * FOLLOW.back);
      tmpTgt.set(crewCam.x + fx * FOLLOW.ahead, 0.2, crewCam.z + fz * FOLLOW.ahead);
      const k = 1 - Math.exp(-dt * 4);
      tw.pos.lerp(tmpPos, k);
      tw.tgt.lerp(tmpTgt, k);
      const e = easeInOut(Math.min(1, (now.current - tw.t0) / FOLLOW.blendIn));
      tmpPos.copy(tw.fromPos).lerp(tw.pos, e);
      tmpTgt.copy(tw.fromTgt).lerp(tw.tgt, e);
      c.setLookAt(tmpPos.x, tmpPos.y, tmpPos.z, tmpTgt.x, tmpTgt.y, tmpTgt.z, false);
      return;
    }
    const u = Math.min(1, Math.max(0, (now.current - tw.t0) / tw.dur));
    if (tw.kind === 'path') {
      const e = easeInOut(u);
      tw.pos.getPoint(e, tmpPos);
      tw.tgt.getPoint(e, tmpTgt);
    } else {
      const e = tw.ease(u);
      tmpTgt.copy(tw.fromTgt).lerp(tw.toTgt, e);
      s0.setFromVector3(off.copy(tw.fromPos).sub(tw.fromTgt));
      s1.setFromVector3(off.copy(tw.toPos).sub(tw.toTgt));
      let dTheta = s1.theta - s0.theta;
      if (dTheta > Math.PI) dTheta -= Math.PI * 2;
      if (dTheta < -Math.PI) dTheta += Math.PI * 2;
      const r = Math.exp(Math.log(Math.max(0.01, s0.radius)) * (1 - e) + Math.log(Math.max(0.01, s1.radius)) * e);
      const phi = s0.phi + (s1.phi - s0.phi) * e;
      const theta = s0.theta + dTheta * e;
      off.setFromSphericalCoords(r, phi, theta);
      tmpPos.copy(tmpTgt).add(off);
    }
    c.setLookAt(tmpPos.x, tmpPos.y, tmpPos.z, tmpTgt.x, tmpTgt.y, tmpTgt.z, false);
    if (u >= 1) tween.current = null;
  });

  // shift the projection centre into the free area between the panels
  useFrame(() => {
    const W = size.width;
    const H = size.height;
    const x = (viewInsets.right - viewInsets.left) / 2;
    const y = (viewInsets.bottom - viewInsets.top) / 2;
    const view = camera.view;
    if (!view || !view.enabled || view.fullWidth !== W || view.fullHeight !== H || Math.abs(view.offsetX - x) > 0.5 || Math.abs(view.offsetY - y) > 0.5) {
      camera.setViewOffset(W, H, x, y, W, H);
      camera.updateProjectionMatrix();
    }
  });

  return <CameraControls ref={ref} makeDefault />;
}
