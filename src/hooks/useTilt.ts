"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export type TiltSource = "pointer" | "orientation" | "drag" | "manual";

type IosDeviceOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** iOS gates the motion sensors behind a user gesture; nothing else does. */
function needsMotionPermission(): boolean {
  if (typeof window === "undefined") return false;
  const D = window.DeviceOrientationEvent as IosDeviceOrientation | undefined;
  return typeof D?.requestPermission === "function";
}

const clamp = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

/*
 * Environment reads go through useSyncExternalStore rather than setState in an
 * effect. Both of these differ between server and client, and resolving them
 * after mount would either cascade a render or hydrate the wrong control — the
 * iOS permission button in particular would flash in for everyone.
 */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMedia(query: string) {
  return (onChange: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  };
}

const subscribeReducedMotion = subscribeToMedia(REDUCED_MOTION);
/** Motion support is fixed for the life of the page; nothing to subscribe to. */
const subscribeNever = () => () => {};

/**
 * Drives the card's tilt as two normalised axes in [-1, 1].
 *
 * The values are written straight onto the element as CSS custom properties
 * inside a rAF loop and deliberately never enter React state — at 60fps a
 * setState per frame would re-render the whole studio and the tilt is the one
 * thing that has to stay smooth on a mid-range phone.
 */
export function useTilt(options: { maxTilt?: number } = {}) {
  const { maxTilt = 1 } = options;

  const ref = useRef<HTMLElement | null>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const dragging = useRef(false);

  const [source, setSource] = useState<TiltSource>("pointer");
  const [motionGranted, setMotionGranted] = useState(false);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  const promptable = useSyncExternalStore(
    subscribeNever,
    needsMotionPermission,
    () => false,
  );
  const permissionNeeded = promptable && !motionGranted;

  /* ---- the animation loop: ease toward target, publish as CSS vars ---- */
  useEffect(() => {
    const tick = () => {
      const c = current.current;
      const t = target.current;

      /* critically-damped-ish easing; fast enough to feel direct, slow enough
         that noisy accelerometer samples don't jitter the card */
      c.x += (t.x - c.x) * 0.14;
      c.y += (t.y - c.y) * 0.14;

      const el = ref.current;
      if (el) {
        el.style.setProperty("--tx", c.x.toFixed(4));
        el.style.setProperty("--ty", c.y.toFixed(4));
        /* pre-split reveal amounts so the CSS doesn't need sign logic */
        el.style.setProperty("--reveal-left", Math.max(0, -c.x).toFixed(4));
        el.style.setProperty("--reveal-right", Math.max(0, c.x).toFixed(4));
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  /* ---- pointer: map cursor position against the card's centre ---- */
  useEffect(() => {
    if (reducedMotion || source === "orientation" || source === "manual") return;

    const onMove = (e: PointerEvent) => {
      if (dragging.current) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      /* full deflection roughly one card-width away from centre */
      target.current = {
        x: clamp(((e.clientX - cx) / (r.width * 0.9)) * maxTilt),
        y: clamp(((e.clientY - cy) / (r.height * 0.9)) * maxTilt),
      };
    };

    const onLeave = () => {
      target.current = { x: 0, y: 0 };
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [maxTilt, reducedMotion, source]);

  /* ---- drag: the fallback when there's no cursor and no sensor ---- */
  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (source === "orientation") return;
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setSource("drag");
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      target.current = {
        x: clamp(((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * maxTilt),
        y: clamp(((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * maxTilt),
      };
    },
    onPointerUp: (e: React.PointerEvent) => {
      dragging.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      target.current = { x: 0, y: 0 };
    },
  };

  /* ---- device orientation ---- */
  const attachOrientation = useCallback(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      /* gamma is left/right roll in degrees; ±26° is a comfortable wrist range
         and reaches full deflection without anyone having to flip the phone */
      target.current = {
        x: clamp(e.gamma / 26) * maxTilt,
        y: clamp((e.beta - 45) / 34) * maxTilt,
      };
    };
    window.addEventListener("deviceorientation", onOrient);
    setSource("orientation");
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [maxTilt]);

  const detachOrientation = useRef<(() => void) | null>(null);

  const enableOrientation = useCallback(async () => {
    const D = window.DeviceOrientationEvent as IosDeviceOrientation | undefined;
    if (!D) return false;

    if (typeof D.requestPermission === "function") {
      try {
        const res = await D.requestPermission();
        if (res !== "granted") return false;
      } catch {
        return false;
      }
    }
    detachOrientation.current?.();
    detachOrientation.current = attachOrientation();
    setMotionGranted(true);
    return true;
  }, [attachOrientation]);

  /* Non-iOS touch devices expose the sensor with no prompt, so just take it. */
  useEffect(() => {
    if (needsMotionPermission() || reducedMotion) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) return;

    let cancelled = false;
    const probe = (e: DeviceOrientationEvent) => {
      if (cancelled || e.gamma === null) return;
      window.removeEventListener("deviceorientation", probe);
      detachOrientation.current?.();
      detachOrientation.current = attachOrientation();
    };
    window.addEventListener("deviceorientation", probe);
    return () => {
      cancelled = true;
      window.removeEventListener("deviceorientation", probe);
    };
  }, [attachOrientation, reducedMotion]);

  useEffect(() => () => detachOrientation.current?.(), []);

  /** Reduced-motion escape hatch: the secret must stay reachable by hand. */
  const setManual = useCallback((x: number) => {
    target.current = { x: clamp(x), y: 0 };
  }, []);

  const enterManual = useCallback(() => setSource("manual"), []);

  return {
    ref,
    source,
    permissionNeeded,
    reducedMotion,
    enableOrientation,
    setManual,
    enterManual,
    dragHandlers,
  };
}
