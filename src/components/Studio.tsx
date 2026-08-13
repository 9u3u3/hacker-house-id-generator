"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MotionStatus } from "@/hooks/useTilt";
import { mint } from "@/lib/builder";
import { resolveFonts, ensureFontsLoaded } from "@/lib/card/fonts";
import { loadCardAssets } from "@/lib/card/assets";
import { PHOTO_ASPECT } from "@/lib/card/layout";
import { computeCrop, loadPhoto, type LoadedPhoto } from "@/lib/photo";
import {
  canShareFile,
  captionFor,
  describePublishError,
  intentUrl,
  metaFor,
  openBlankTab,
  pngFile,
  publishRender,
  renderPass,
  sendTabTo,
  shareFileNatively,
} from "@/lib/share";
import type { PhotoSource } from "@/lib/card/draw";
import { useTilt } from "@/hooks/useTilt";
import { Backdrop } from "./Backdrop";
import { Diagnostics } from "./Diagnostics";
import { Marquee } from "./Marquee";
import { TidePass } from "./TidePass";

type Status = { kind: "idle" | "working" | "error"; message?: string };

/** `origin` never changes for the life of the document, so there's nothing to
    subscribe to — this exists only to satisfy the store contract. */
const subscribeNever = () => () => {};

export function Studio() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [stack, setStack] = useState("");
  const [handle, setHandle] = useState("");
  const [salt, setSalt] = useState(0);

  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [manualTilt, setManualTilt] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [canShareImage, setCanShareImage] = useState(false);
  const [copied, setCopied] = useState<"link" | "caption" | null>(null);

  /* window.location isn't there during the server render, and reading it into
     state from an effect would cascade a second render on every mount */
  const origin = useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => "",
  );

  const tilt = useTilt();

  const pass = useMemo(
    () => mint({ name, role, stack, handle, salt }),
    [name, role, stack, handle, salt],
  );

  const photoSource = useMemo(
    () => (photo ? computeCrop(photo, PHOTO_ASPECT) : null),
    [photo],
  );

  /* Warm the fonts as soon as the studio mounts. Canvas won't wait for them,
     and a cold first draw renders the card in a fallback serif. */
  useEffect(() => {
    void ensureFontsLoaded(resolveFonts());
    void loadCardAssets();
  }, []);

  const handleFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    setStatus({ kind: "working", message: "reading photo" });
    try {
      const loaded = await loadPhoto(file);
      setPhoto(loaded);
      setStatus({ kind: "idle" });
    } catch (err) {
      console.error(err);
      setStatus({
        kind: "error",
        message: "couldn't read that image — try a jpg or png",
      });
    }
  }, []);

  const ready = name.trim().length > 0;
  const caption = useMemo(() => captionFor(pass), [pass]);

  /*
   * The last full-res render, kept keyed on exactly what produced it.
   *
   * Two things need it. `navigator.share` is gated on user activation just like
   * `window.open`, so rendering inside the click handler and then sharing loses
   * the gesture — the blob has to exist *before* the tap. And having it around
   * makes DOWNLOAD and SHARE instant instead of re-rendering 2400x1350 each
   * time. Nothing is uploaded here; this is the same local render as always.
   */
  const prepared = useRef<{
    pass: typeof pass;
    photo: PhotoSource | null;
    blob: Blob;
  } | null>(null);

  const preparedBlob = useCallback(
    () =>
      prepared.current &&
      prepared.current.pass === pass &&
      prepared.current.photo === photoSource
        ? prepared.current.blob
        : null,
    [pass, photoSource],
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    /* debounced: the pass re-mints on every keystroke */
    const timer = setTimeout(() => {
      renderPass({ pass, photo: photoSource })
        .then((blob) => {
          if (cancelled) return;
          prepared.current = { pass, photo: photoSource, blob };
          setCanShareImage(canShareFile(pngFile(blob, pass.serial)));
        })
        .catch((err) => console.error("share pre-render failed", err));
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, pass, photoSource]);

  const download = useCallback(async () => {
    setStatus({ kind: "working", message: "rendering" });
    try {
      const blob = preparedBlob() ?? (await renderPass({ pass, photo: photoSource }));

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hh-goa-2026-${pass.serial.toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* revoke on the next frame so Safari has actually started the download */
      requestAnimationFrame(() => URL.revokeObjectURL(url));
      setStatus({ kind: "idle" });
    } catch (err) {
      console.error(err);
      setStatus({ kind: "error", message: "render failed — try again" });
    }
  }, [pass, photoSource, preparedBlob]);

  /**
   * Share to X.
   *
   * Deliberately **not** an async function. The tab is claimed on the first
   * line, while the click's user activation is still live; everything slow
   * happens afterwards and just redirects the tab it already holds. Doing the
   * work first and opening at the end is what made this button silently do
   * nothing on Safari and Chrome-Android.
   */
  const shareToX = useCallback(() => {
    const tab = openBlankTab();
    const home = window.location.origin;
    setStatus({ kind: "working", message: "publishing" });

    void (async () => {
      try {
        const blob = preparedBlob() ?? (await renderPass({ pass, photo: photoSource }));
        const { path } = await publishRender(blob, metaFor(pass, salt));
        const url = `${home}${path}`;
        setShareUrl(url);
        sendTabTo(tab, intentUrl(caption, url));
        setStatus({ kind: "idle" });
      } catch (err) {
        console.error(err);
        /* a dead button is the worst outcome — post the caption pointing at the
           generator rather than nothing at all, and say what actually broke */
        sendTabTo(tab, intentUrl(caption, home));
        setStatus({ kind: "error", message: describePublishError(err) });
      }
    })();
  }, [pass, photoSource, salt, caption, preparedBlob]);

  /**
   * Attach the real PNG to the post instead of relying on a link preview.
   *
   * Phones only, and only from the pre-rendered blob — `navigator.share` spends
   * the same user activation `window.open` does, so it cannot be awaited into.
   */
  const shareImage = useCallback(() => {
    const blob = preparedBlob();
    if (!blob) {
      setStatus({ kind: "working", message: "still rendering — try again in a second" });
      return;
    }
    shareFileNatively({
      file: pngFile(blob, pass.serial),
      caption,
      url: window.location.origin,
    })
      .then(() => setStatus({ kind: "idle" }))
      .catch((err) => {
        console.error(err);
        setStatus({ kind: "error", message: "the share sheet wouldn't open" });
      });
  }, [pass.serial, caption, preparedBlob]);

  const copy = useCallback(async (what: "link" | "caption", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setStatus({ kind: "error", message: "clipboard blocked — select the link by hand" });
    }
  }, []);

  return (
    <div className="min-h-dvh text-paper">
      <Backdrop />
      <Marquee />

      <main className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-24 pt-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-16 lg:pt-16">
        {/* ---------------- card ---------------- */}
        <section className="flex flex-col items-center gap-5">
          <TidePass
            pass={pass}
            photo={photoSource}
            tiltRef={tilt.ref as React.Ref<HTMLDivElement>}
            dragHandlers={tilt.dragHandlers}
            onDrawError={(message) =>
              setStatus({ kind: "error", message: `card render: ${message}` })
            }
          />

          <TiltHint
            source={tilt.source}
            permissionNeeded={tilt.permissionNeeded}
            motionStatus={tilt.motionStatus}
            sensorBlocked={tilt.sensorBlocked}
            isTouch={tilt.isTouch}
            reducedMotion={tilt.reducedMotion}
            onEnable={tilt.enableOrientation}
            onPlay={tilt.playSweep}
            manual={manualTilt}
            onManual={(v) => {
              setManualTilt(v);
              tilt.enterManual();
              tilt.setManual(v);
            }}
          />
        </section>

        {/* ---------------- controls ---------------- */}
        <section className="flex flex-col gap-7">
          <header>
            <p className="font-mono text-[11px] tracking-[0.35em] text-yellow">
              HACKER HOUSE GOA · 28–31 OCT 2026
            </p>
            <h1 className="font-display mt-2 text-6xl sm:text-7xl">
              MINT YOUR
              <br />
              TIDE PASS
            </h1>
            <p className="mt-4 max-w-md font-mono text-sm leading-relaxed text-paper/70">
              Drop a photo, take your seat. Then tilt the card — it doesn&apos;t
              show you the same thing twice.
            </p>
          </header>

          <Dropzone
            hasPhoto={!!photo}
            dragOver={dragOver}
            onDragState={setDragOver}
            onFile={handleFile}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="NAME"
              value={name}
              onChange={setName}
              placeholder="your name"
              maxLength={28}
            />
            <Field
              label="X HANDLE"
              value={handle}
              onChange={setHandle}
              placeholder="@you"
              maxLength={20}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="ROLE"
              value={role}
              onChange={setRole}
              placeholder="design engineer"
              maxLength={22}
            />
            <Field
              label="STACK"
              value={stack}
              onChange={setStack}
              placeholder="typescript · rust"
              maxLength={28}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-paper/15 bg-green-deep/40 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.3em] text-paper/50">
                BUILDER CLASS
              </p>
              <p className="truncate font-mono text-lg font-bold text-yellow">
                {pass.builderClass}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSalt((s) => s + 1)}
              className="shrink-0 rounded-full border border-yellow/50 px-4 py-2 font-mono text-xs tracking-widest text-yellow transition hover:bg-yellow hover:text-green-ink"
            >
              REROLL
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void download()}
              disabled={!ready || status.kind === "working"}
              className="rounded-full bg-yellow px-7 py-3.5 font-mono text-sm font-bold tracking-widest text-green-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status.kind === "working" ? "WORKING…" : "DOWNLOAD PNG"}
            </button>

            <button
              type="button"
              onClick={shareToX}
              disabled={!ready || status.kind === "working"}
              className="rounded-full border border-paper/40 px-7 py-3.5 font-mono text-sm font-bold tracking-widest text-paper transition hover:border-paper hover:bg-paper hover:text-green-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              SHARE TO X
            </button>

            {ready && canShareImage && (
              <button
                type="button"
                onClick={shareImage}
                className="rounded-full border border-pink/60 px-7 py-3.5 font-mono text-sm font-bold tracking-widest text-pink transition hover:bg-pink hover:text-paper"
              >
                SHARE IMAGE
              </button>
            )}
          </div>

          {ready && origin && (
            <ShareFallback
              intent={intentUrl(caption, shareUrl ?? origin)}
              link={shareUrl}
              caption={caption}
              copied={copied}
              onCopy={copy}
            />
          )}

          {status.kind === "error" && (
            <p role="alert" className="font-mono text-sm text-pink">
              {status.message}
            </p>
          )}

          {!ready && (
            <p className="font-mono text-xs text-paper/45">
              Add your name to unlock download.
            </p>
          )}
        </section>
      </main>

      <Diagnostics />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The manual route, always on screen once there's a name to share.
 *
 * A popup blocker can still eat the tab even when `window.open` fires on the
 * gesture — an extension, a locked-down enterprise profile, an in-app webview.
 * This block means the flow is always completable by hand: a real anchor the
 * browser treats as navigation rather than a popup, plus the two strings needed
 * to post it from anywhere.
 *
 * It renders *before* publishing too, pointed at the generator itself, so the
 * "post a how-to link" half of the task works even if publish is down.
 */
function ShareFallback(props: {
  intent: string;
  link: string | null;
  caption: string;
  copied: "link" | "caption" | null;
  onCopy: (what: "link" | "caption", text: string) => void;
}) {
  const chip =
    "rounded-full border border-paper/25 px-4 py-2 font-mono text-[11px] tracking-widest text-paper/80 transition hover:border-paper hover:text-paper";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-paper/15 bg-green-deep/50 p-4">
      <p className="font-mono text-[10px] tracking-[0.3em] text-paper/50">
        {props.link ? "PUBLISHED — POST IT" : "IF THE POPUP GETS BLOCKED"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={props.intent}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-paper px-4 py-2 font-mono text-[11px] font-bold tracking-widest text-green-ink transition hover:brightness-110"
        >
          OPEN X COMPOSER ↗
        </a>

        <button
          type="button"
          onClick={() => props.onCopy("link", props.link ?? props.intent)}
          className={chip}
        >
          {props.copied === "link" ? "COPIED ✓" : "COPY LINK"}
        </button>

        <button
          type="button"
          onClick={() => props.onCopy("caption", props.caption)}
          className={chip}
        >
          {props.copied === "caption" ? "COPIED ✓" : "COPY CAPTION"}
        </button>
      </div>

      {props.link && (
        <p className="font-mono text-xs break-all text-paper/60">
          live link:{" "}
          <a href={props.link} className="text-yellow underline">
            {props.link}
          </a>
        </p>
      )}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] tracking-[0.3em] text-paper/50">
        {props.label}
      </span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        className="mt-1.5 w-full rounded-lg border border-paper/20 bg-green-deep/50 px-4 py-3 font-mono text-base text-paper outline-none transition placeholder:text-paper/30 focus:border-yellow"
      />
    </label>
  );
}

/**
 * A real <label> wrapping a real <input type="file">.
 *
 * This was a <button> that called input.click() on a visually-hidden input.
 * Android browsers are unreliable about opening the picker for a synthetic
 * click on a clipped input — a label's native activation always works.
 *
 * `accept` is plain "image/*" too: Android's picker mishandles a list that
 * mixes MIME types with file extensions, and iOS already offers HEIC under
 * image/*, so listing .heic/.heif bought nothing and broke the picker.
 */
function Dropzone(props: {
  hasPhoto: boolean;
  dragOver: boolean;
  onDragState: (v: boolean) => void;
  onFile: (f: File | undefined) => void;
}) {
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        props.onDragState(true);
      }}
      onDragLeave={() => props.onDragState(false)}
      onDrop={(e) => {
        e.preventDefault();
        props.onDragState(false);
        props.onFile(e.dataTransfer.files?.[0]);
      }}
      className={`block w-full cursor-pointer rounded-xl border-2 border-dashed px-5 py-7 text-left transition ${
        props.dragOver
          ? "border-yellow bg-yellow/10"
          : "border-paper/25 hover:border-paper/50"
      }`}
    >
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          props.onFile(e.target.files?.[0]);
          /* let the same file be picked twice in a row */
          e.target.value = "";
        }}
      />
      <p className="font-mono text-sm font-bold tracking-widest text-yellow">
        {props.hasPhoto ? "SWAP PHOTO" : "DROP A PHOTO"}
      </p>
      <p className="mt-1 font-mono text-xs text-paper/55">
        jpg · png · heic from your iPhone. We&apos;ll centre it for you — no
        cropping needed.
      </p>
    </label>
  );
}

function TiltHint(props: {
  source: string;
  permissionNeeded: boolean;
  motionStatus: MotionStatus;
  sensorBlocked: boolean;
  isTouch: boolean;
  reducedMotion: boolean;
  onEnable: () => Promise<boolean>;
  onPlay: () => void;
  manual: number;
  onManual: (v: number) => void;
}) {
  if (props.reducedMotion) {
    return (
      <div className="w-full max-w-[380px]">
        <label className="font-mono text-[10px] tracking-[0.3em] text-paper/50">
          SUNRISE ← → NIGHT
        </label>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={props.manual}
          onChange={(e) => props.onManual(Number(e.target.value))}
          className="mt-2 w-full accent-yellow"
        />
      </div>
    );
  }

  /* motion is running — nothing left to offer */
  if (props.motionStatus === "live") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-[11px] tracking-[0.3em] text-yellow/80">
          TILT YOUR PHONE ←→
        </p>
        <PlayReveal onPlay={props.onPlay} />
      </div>
    );
  }

  if (!props.isTouch) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-[11px] tracking-[0.3em] text-paper/45">
          MOVE TO TILT
        </p>
        <PlayReveal onPlay={props.onPlay} />
      </div>
    );
  }

  /*
   * Every touch device gets the button, not just iOS. Subscribing to the sensor
   * on load is unreliable — Chrome is far more willing to deliver readings
   * after a user gesture, and iOS refuses the permission prompt without one.
   */
  const note: Record<string, string> = {
    blocked:
      "your browser is blocking motion sensors — in Brave, drop Shields for this site. drag works meanwhile",
    denied: "motion permission denied — drag the card instead",
    insecure: "motion tilt needs https",
    unsupported: "no motion sensor on this device — drag the card instead",
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void props.onEnable()}
        disabled={props.motionStatus === "requesting"}
        className="rounded-full border border-yellow/60 px-5 py-2.5 font-mono text-xs tracking-widest text-yellow transition hover:bg-yellow hover:text-green-ink disabled:opacity-50"
      >
        {props.motionStatus === "requesting"
          ? "CHECKING SENSOR…"
          : "ENABLE MOTION TILT ↗"}
      </button>

      <PlayReveal onPlay={props.onPlay} />

      <p className="font-mono text-[10px] tracking-[0.25em] text-paper/40">
        OR DRAG THE CARD ←→
      </p>

      {note[props.motionStatus] && (
        <p className="max-w-[300px] text-center font-mono text-[10px] leading-relaxed text-pink/80">
          {note[props.motionStatus]}
        </p>
      )}
    </div>
  );
}

/** Hands-free playback of the reveal, for when tilt isn't available. */
function PlayReveal({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="rounded-full bg-pink/90 px-5 py-2.5 font-mono text-xs font-bold tracking-widest text-paper transition hover:brightness-110"
    >
      ▶ PLAY THE REVEAL
    </button>
  );
}
