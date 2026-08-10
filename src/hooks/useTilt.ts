"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export type TiltSource = "pointer" | "orientation" | "drag" | "manual";

/** Why motion tilt is or isn't running, so the UI can say something true. */
export type MotionStatus =
  | "idle"
  | "requesting"
  | "live"
  | "denied"
  | "blocked"
  | "insecure"
  | "unsupported";

type IosDeviceOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** iOS gates the motion sensors behind a user gesture; nothing else does. */
function needsMotionPermission(): boolean {
  if (typeof window === "undefined") return false;
  if (!isSecure()) return false;
  const D = window.DeviceOrientationEvent as IosDeviceOrientation | undefined;
  return typeof D?.requestPermission === "function";
}

/**
 * `deviceorientation` is a powerful feature and browsers only expose it on a
 * secure origin. Served over plain HTTP — a LAN address during development,
 * say — the event never fires no matter what you subscribe to, so the UI has
 * to know to offer dragging instead of telling people to tilt their phone.
 */
function isSecure(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

function orientationUnavailable(): boolean {
  if (typeof window === "undefined") return true;
  return !isSecure() || typeof window.DeviceOrientationEvent === "undefined";
}

function coarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
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
  /* an auto-sweep owns the tilt while it runs, so other inputs stand down */
  const sweeping = useRef(false);
  const sweepRaf = useRef<number | null>(null);

  const [source, setSource] = useState<TiltSource>("pointer");
  const [motionGranted, setMotionGranted] = useState(false);
  const [motionStatus, setMotionStatus] = useState<MotionStatus>("idle");

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

  /* touch device where the sensor can never fire — drag is the only option */
  const sensorBlocked = useSyncExternalStore(
    subscribeNever,
    () => coarsePointer() && orientationUnavailable(),
    () => false,
  );
  const isTouch = useSyncExternalStore(subscribeNever, coarsePointer, () => false);

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
      if (dragging.current || sweeping.current) return;
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
      if (source === "orientation" || sweeping.current) return;
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

  const detachOrientation = useRef<(() => void) | null>(null);
  /** first reading, used as the neutral point */
  const baseline = useRef<{ beta: number; gamma: number } | null>(null);

  /**
   * Attach the sensor and report whether readings actually arrive.
   *
   * Subscribing is not the same as receiving. Brave blocks motion sensors as a
   * fingerprinting vector and Chrome will happily accept the listener while
   * delivering nothing, so the only way to know the sensor works is to wait for
   * a reading and time out if none comes.
   */
  const attachOrientation = useCallback(async (): Promise<boolean> => {
    detachOrientation.current?.();
    baseline.current = null;

    let live = false;

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;

      /*
       * Calibrate to however the phone happens to be held. Absolute beta is
       * ~75-90 degrees for someone reading at a natural angle, so treating 0 as
       * neutral pinned the card at full deflection before anyone moved it.
       */
      if (!baseline.current) {
        baseline.current = { beta: e.beta, gamma: e.gamma };
        live = true;
        setSource("orientation");
        setMotionStatus("live");
      }

      const base = baseline.current;
      target.current = {
        /* +-22 degrees of roll reaches full deflection — a wrist movement */
        x: clamp((e.gamma - base.gamma) / 22) * maxTilt,
        y: clamp((e.beta - base.beta) / 26) * maxTilt,
      };
    };

    window.addEventListener("deviceorientation", onOrient);
    detachOrientation.current = () => {
      window.removeEventListener("deviceorientation", onOrient);
      baseline.current = null;
    };

    await new Promise((resolve) => setTimeout(resolve, 1400));

    if (!live) {
      detachOrientation.current?.();
      detachOrientation.current = null;
      return false;
    }
    return true;
  }, [maxTilt]);

  /**
   * Turn on motion tilt. Must be called from a tap: iOS requires a gesture for
   * the permission prompt, and other browsers are more willing to start
   * delivering sensor data after user activation.
   */
  const enableOrientation = useCallback(async (): Promise<boolean> => {
    if (!isSecure()) {
      setMotionStatus("insecure");
      return false;
    }

    const D = window.DeviceOrientationEvent as IosDeviceOrientation | undefined;
    if (!D) {
      setMotionStatus("unsupported");
      return false;
    }

    setMotionStatus("requesting");

    if (typeof D.requestPermission === "function") {
      try {
        const res = await D.requestPermission();
        if (res !== "granted") {
          setMotionStatus("denied");
          return false;
        }
      } catch {
        setMotionStatus("denied");
        return false;
      }
    }
    setMotionGranted(true);

    const ok = await attachOrientation();
    if (!ok) setMotionStatus("blocked");
    return ok;
  }, [attachOrientation]);

  /*
   * Browsers that hand over the sensor unprompted get it without a tap. This is
   * best-effort only — if nothing arrives the button is still there, and iOS is
   * skipped entirely because it would burn the one gesture-free attempt.
   */
  useEffect(() => {
    if (reducedMotion || needsMotionPermission()) return;
    if (orientationUnavailable() || !coarsePointer()) return;

    let cancelled = false;
    void attachOrientation().then((ok) => {
      if (!ok && !cancelled) setMotionStatus("idle");
    });
    return () => {
      cancelled = true;
    };
  }, [attachOrientation, reducedMotion]);

  useEffect(() => () => detachOrientation.current?.(), []);

  /**
   * Play the whole reveal hands-free: flat, into sunrise, back through flat,
   * into night, and home again.
   *
   * The hidden layers are the entire point of the card, and they can be
   * unreachable through no fault of the visitor — Brave blocks motion sensors
   * by default, and a desktop visitor with no mouse movement never discovers
   * them either. This guarantees everyone can see what the card does.
   */
  const playSweep = useCallback(() => {
    if (sweepRaf.current !== null) cancelAnimationFrame(sweepRaf.current);

    sweeping.current = true;
    const started = performance.now();
    const DURATION = 4600;

    const step = (now: number) => {
      const t = (now - started) / DURATION;
      if (t >= 1) {
        target.current = { x: 0, y: 0 };
        sweeping.current = false;
        sweepRaf.current = null;
        return;
      }
      /* -sin(2*pi*t): 0 -> -1 (sunrise) -> 0 -> +1 (night) -> 0 */
      target.current = { x: -Math.sin(t * Math.PI * 2), y: 0 };
      sweepRaf.current = requestAnimationFrame(step);
    };

    sweepRaf.current = requestAnimationFrame(step);
  }, []);

  useEffect(
    () => () => {
      if (sweepRaf.current !== null) cancelAnimationFrame(sweepRaf.current);
    },
    [],
  );

  /** Reduced-motion escape hatch: the secret must stay reachable by hand. */
  const setManual = useCallback((x: number) => {
    target.current = { x: clamp(x), y: 0 };
  }, []);

  const enterManual = useCallback(() => setSource("manual"), []);

  return {
    ref,
    source,
    permissionNeeded,
    motionStatus,
    sensorBlocked,
    isTouch,
    reducedMotion,
    enableOrientation,
    playSweep,
    setManual,
    enterManual,
    dragHandlers,
  };
}
