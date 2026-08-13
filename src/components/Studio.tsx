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
import { CREW_MAX, CREW_MIN, mint, mintCrew, type Tier } from "@/lib/builder";
import { resolveFonts, ensureFontsLoaded } from "@/lib/card/fonts";
import { loadCardAssets } from "@/lib/card/assets";
import { PHOTO_ASPECT } from "@/lib/card/layout";
import { computeCrop, loadPhoto, type LoadedPhoto } from "@/lib/photo";
import {
  canShareFile,
  captionFor,
  captionForCrew,
  describePublishError,
  intentUrl,
  metaFor,
  metaForCrew,
  openBlankTab,
  pngFile,
  publishRender,
  renderCrew,
  renderPass,
  sendTabTo,
  shareFileNatively,
  videoFile,
} from "@/lib/share";
import {
  prepareSweep,
  SWEEP_CYCLE_MS,
  SWEEP_DURATION_MS,
  SWEEP_FPS,
} from "@/lib/card/sweep";
import { recordCanvas, videoSupported, type RecordedVideo } from "@/lib/video";
import type { PhotoSource } from "@/lib/card/draw";
import { useTilt } from "@/hooks/useTilt";
import { Backdrop } from "./Backdrop";
import { CrewPass } from "./CrewPass";
import { Diagnostics } from "./Diagnostics";
import { Marquee } from "./Marquee";
import { TidePass } from "./TidePass";

type Status = { kind: "idle" | "working" | "error"; message?: string };

/** `origin` never changes for the life of the document, so there's nothing to
    subscribe to — this exists only to satisfy the store contract. */
const subscribeNever = () => () => {};

type Adjust = { zoom: number; offsetX: number; offsetY: number };

/** What `computeCrop` does on its own: subject-aware, no user input. */
const AUTO_CROP: Adjust = { zoom: 1, offsetX: 0, offsetY: 0 };

/**
 * SOLO is the card this app has always made; CREW is the combined team pass.
 *
 * A toggle rather than a rewrite, deliberately: hhgoa.com's brief asks for both
 * ("design your own frame generator" *and* "use that same generator to bring
 * your teammates into one combined frame"), and the solo flow is the one that's
 * been tested on real phones. Crew mode is additive — nothing in the solo path
 * branches on it.
 */
type Mode = "solo" | "crew";

type Member = {
  /** stable across re-renders so React keys survive a photo swap */
  id: number;
  name: string;
  photo: LoadedPhoto | null;
  adjust: Adjust;
};

let nextMemberId = 1;
const blankMember = (): Member => ({
  id: nextMemberId++,
  name: "",
  photo: null,
  adjust: AUTO_CROP,
});

/** Element-wise identity check — every dependency here is memoised. */
function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

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
  const [adjust, setAdjust] = useState<Adjust>(AUTO_CROP);
  /* kept with the deps it was recorded from, so a REROLL doesn't leave a
     "SHARE THE CLIP" button pointing at the previous card */
  const [video, setVideo] = useState<{
    deps: readonly unknown[];
    result: RecordedVideo;
  } | null>(null);

  const [mode, setMode] = useState<Mode>("solo");
  const [team, setTeam] = useState("");
  const [members, setMembers] = useState<Member[]>(() => [
    blankMember(),
    blankMember(),
  ]);

  /* window.location isn't there during the server render, and reading it into
     state from an effect would cascade a second render on every mount */
  const origin = useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => "",
  );

  /* MediaRecorder + captureStream aren't universal, and the server can't know */
  const canRecord = useSyncExternalStore(subscribeNever, videoSupported, () => false);

  const tilt = useTilt();

  const pass = useMemo(
    () => mint({ name, role, stack, handle, salt }),
    [name, role, stack, handle, salt],
  );

  const photoSource = useMemo(
    () => (photo ? computeCrop(photo, PHOTO_ASPECT, adjust) : null),
    [photo, adjust],
  );

  /* Crew tiles are cut at the same aspect as the card's own photo window, so a
     crew photo runs through the identical subject-aware crop — which matters
     more here, since three photos of different shapes sit side by side and one
     face landing off-centre is immediately obvious. */
  const crewPhotos = useMemo(
    () =>
      members.map((m) =>
        m.photo ? computeCrop(m.photo, PHOTO_ASPECT, m.adjust) : null,
      ),
    [members],
  );

  const crew = useMemo(
    () =>
      mintCrew({
        team,
        members: members.map((m) => ({
          name: m.name,
          role: "",
          stack: "",
          handle: "",
          salt,
        })),
        salt,
      }),
    [team, members, salt],
  );

  const crewReady =
    team.trim().length > 0 && members.every((m) => m.name.trim().length > 0);

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
      /* a new photo gets the auto crop, not the last one's nudges */
      setAdjust(AUTO_CROP);
      setStatus({ kind: "idle" });
    } catch (err) {
      console.error(err);
      setStatus({
        kind: "error",
        message: "couldn't read that image — try a jpg or png",
      });
    }
  }, []);

  /* ---------------- whichever pass is on screen ---------------- */

  const isCrew = mode === "crew";
  const patchMember = useCallback((id: number, patch: Partial<Member>) => {
    setMembers((list) =>
      list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  }, []);

  const handleMemberFile = useCallback(
    async (id: number, file: File | undefined | null) => {
      if (!file) return;
      setStatus({ kind: "working", message: "reading photo" });
      try {
        const loaded = await loadPhoto(file);
        patchMember(id, { photo: loaded, adjust: AUTO_CROP });
        setStatus({ kind: "idle" });
      } catch (err) {
        console.error(err);
        setStatus({
          kind: "error",
          message: "couldn't read that image — try a jpg or png",
        });
      }
    },
    [patchMember],
  );

  /* Switching to CREW carries the solo card over as the first member rather
     than starting empty — the photo is already decoded and re-uploading it to
     say the same thing is the kind of friction the brief calls out. */
  const enterCrew = useCallback(() => {
    setMembers((list) =>
      list[0].name || list[0].photo
        ? list
        : [{ ...list[0], name, photo, adjust }, ...list.slice(1)],
    );
    setMode("crew");
  }, [name, photo, adjust]);

  const ready = isCrew ? crewReady : name.trim().length > 0;
  const serial = isCrew ? crew.serial : pass.serial;

  const caption = useMemo(
    () => (isCrew ? captionForCrew(crew) : captionFor(pass)),
    [isCrew, crew, pass],
  );

  /* the identity of everything the render depends on, so the cache below can
     tell "same card" from "the user typed a letter" without a deep compare */
  const renderDeps = useMemo<readonly unknown[]>(
    () => (isCrew ? ["crew", crew, crewPhotos] : ["solo", pass, photoSource]),
    [isCrew, crew, crewPhotos, pass, photoSource],
  );

  const renderCurrent = useCallback(
    () =>
      isCrew
        ? renderCrew({ crew, photos: crewPhotos })
        : renderPass({ pass, photo: photoSource }),
    [isCrew, crew, crewPhotos, pass, photoSource],
  );

  /*
   * The last full-res render, kept keyed on exactly what produced it.
   *
   * Two things need it. `navigator.share` is gated on user activation just like
   * `window.open`, so rendering inside the click handler and then sharing loses
   * the gesture — the blob has to exist *before* the tap. And having it around
   * makes DOWNLOAD and SHARE instant instead of re-rendering 2400x1350 each
   * time. Nothing is uploaded here; this is the same local render as always.
   */
  const prepared = useRef<{ deps: readonly unknown[]; blob: Blob } | null>(null);

  const preparedBlob = useCallback(
    () =>
      prepared.current && sameDeps(prepared.current.deps, renderDeps)
        ? prepared.current.blob
        : null,
    [renderDeps],
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    /* debounced: the pass re-mints on every keystroke */
    const timer = setTimeout(() => {
      renderCurrent()
        .then((blob) => {
          if (cancelled) return;
          prepared.current = { deps: renderDeps, blob };
          setCanShareImage(canShareFile(pngFile(blob, serial)));
        })
        .catch((err) => console.error("share pre-render failed", err));
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, renderCurrent, renderDeps, serial]);

  const download = useCallback(async () => {
    setStatus({ kind: "working", message: "rendering" });
    try {
      const blob = preparedBlob() ?? (await renderCurrent());

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hh-goa-2026-${serial.toLowerCase()}.png`;
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
  }, [serial, renderCurrent, preparedBlob]);

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
        const blob = preparedBlob() ?? (await renderCurrent());
        const { path } = await publishRender(
          blob,
          isCrew ? metaForCrew(crew, salt) : metaFor(pass, salt),
        );
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
  }, [isCrew, crew, pass, salt, caption, renderCurrent, preparedBlob]);

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
      file: pngFile(blob, serial),
      caption,
      url: window.location.origin,
    })
      .then(() => setStatus({ kind: "idle" }))
      .catch((err) => {
        console.error(err);
        setStatus({ kind: "error", message: "the share sheet wouldn't open" });
      });
  }, [serial, caption, preparedBlob]);

  /**
   * The animated reveal, as a postable video.
   *
   * Solo only: the tilt is the solo card's gimmick and the crew pass has a
   * single printing, so there is nothing to interlace. Recording runs in real
   * time — MediaRecorder timestamps from the wall clock — so it takes about as
   * long as the clip does and reports progress while it goes.
   */
  const recordSweep = useCallback(async () => {
    setStatus({ kind: "working", message: "recording the reveal — 0%" });
    try {
      const fonts = resolveFonts();
      const [assets] = await Promise.all([
        loadCardAssets(),
        ensureFontsLoaded(fonts),
      ]);
      const sweep = prepareSweep({ pass, photo: photoSource, fonts, assets });

      const canvas = document.createElement("canvas");
      canvas.width = sweep.width;
      canvas.height = sweep.height;

      const result = await recordCanvas({
        canvas,
        durationMs: SWEEP_DURATION_MS,
        cycleMs: SWEEP_CYCLE_MS,
        fps: SWEEP_FPS,
        drawFrame: sweep.drawFrame,
        onProgress: (f) =>
          setStatus({
            kind: "working",
            message: `recording the reveal — ${Math.round(f * 100)}%`,
          }),
      });

      setVideo({ deps: renderDeps, result });

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hh-goa-2026-${pass.serial.toLowerCase()}.${result.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      requestAnimationFrame(() => URL.revokeObjectURL(url));
      setStatus({ kind: "idle" });
    } catch (err) {
      console.error(err);
      setStatus({
        kind: "error",
        message:
          err instanceof Error ? `video export failed — ${err.message}` : "video export failed",
      });
    }
  }, [pass, photoSource, renderDeps]);

  const freshVideo =
    video && sameDeps(video.deps, renderDeps) ? video.result : null;

  /** Share the clip that was just recorded — the blob already exists, so this
      doesn't have to await anything inside the gesture. */
  const shareVideo = useCallback(() => {
    if (!freshVideo) return;
    const file = videoFile(freshVideo.blob, pass.serial, freshVideo.ext);
    if (!canShareFile(file)) {
      setStatus({ kind: "error", message: "this browser won't share video files" });
      return;
    }
    shareFileNatively({ file, caption, url: window.location.origin })
      .then(() => setStatus({ kind: "idle" }))
      .catch((err) => {
        console.error(err);
        setStatus({ kind: "error", message: "the share sheet wouldn't open" });
      });
  }, [freshVideo, pass.serial, caption]);

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
          {isCrew ? (
            <>
              <CrewPass
                crew={crew}
                photos={crewPhotos}
                onDrawError={(message) =>
                  setStatus({ kind: "error", message: `crew render: ${message}` })
                }
              />
              <p className="max-w-[380px] text-center font-mono text-[10px] leading-relaxed tracking-widest text-paper/45">
                ONE FRAME, {crew.members.length} BUILDERS. THE TILT REVEAL LIVES ON
                THE SOLO PASS.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </section>

        {/* ---------------- controls ---------------- */}
        <section className="flex flex-col gap-7">
          <header>
            <p className="font-mono text-[11px] tracking-[0.35em] text-yellow">
              HACKER HOUSE GOA · 28–31 OCT 2026
            </p>
            <h1 className="font-display mt-2 text-6xl sm:text-7xl">
              {isCrew ? (
                <>
                  MINT YOUR
                  <br />
                  CREW PASS
                </>
              ) : (
                <>
                  MINT YOUR
                  <br />
                  TIDE PASS
                </>
              )}
            </h1>
            <p className="mt-4 max-w-md font-mono text-sm leading-relaxed text-paper/70">
              {isCrew
                ? "Two or three of you, one combined frame. Same generator, same builder classes — one card you can all post."
                : "Drop a photo, take your seat. Then tilt the card — it doesn't show you the same thing twice."}
            </p>
          </header>

          <ModeToggle mode={mode} onSolo={() => setMode("solo")} onCrew={enterCrew} />

          {isCrew ? (
            <CrewRoster
              team={team}
              onTeam={setTeam}
              members={members}
              crops={crewPhotos}
              classes={crew.members.map((m) => m.builderClass)}
              tiers={crew.members.map((m) => m.tier)}
              onName={(id, v) => patchMember(id, { name: v })}
              onFile={handleMemberFile}
              onAdjust={(id, next) => patchMember(id, { adjust: next })}
              onAdd={() => setMembers((l) => [...l, blankMember()])}
              onRemove={(id) => setMembers((l) => l.filter((m) => m.id !== id))}
            />
          ) : (
            <>
              <Dropzone
                hasPhoto={!!photo}
                dragOver={dragOver}
                onDragState={setDragOver}
                onFile={handleFile}
              />

              {photo && photoSource && (
                <PhotoFramer
                  photo={photo}
                  crop={photoSource}
                  adjust={adjust}
                  onAdjust={setAdjust}
                />
              )}

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
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-paper/15 bg-green-deep/85 p-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-paper/50">
                {isCrew ? "CREW PASS" : "BUILDER CLASS"}
                {!isCrew && <TierPip tier={pass.tier} />}
              </p>
              <p className="truncate font-mono text-lg font-bold text-yellow">
                {isCrew ? crew.serial : pass.builderClass}
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

          {/* the reveal is the whole product, and a static PNG doesn't carry it */}
          {!isCrew && canRecord && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void recordSweep()}
                disabled={!ready || status.kind === "working"}
                className="rounded-full border border-yellow/60 px-7 py-3.5 font-mono text-sm font-bold tracking-widest text-yellow transition hover:bg-yellow hover:text-green-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                ▶ RECORD THE REVEAL
              </button>

              {freshVideo && (
                <button
                  type="button"
                  onClick={shareVideo}
                  className="rounded-full border border-pink/60 px-6 py-3 font-mono text-xs font-bold tracking-widest text-pink transition hover:bg-pink hover:text-paper"
                >
                  SHARE THE CLIP
                </button>
              )}

              <p className="w-full font-mono text-[10px] leading-relaxed text-paper/45">
                A {(SWEEP_DURATION_MS / 1000).toFixed(0)}s loop of the tilt, as{" "}
                {freshVideo?.ext.toUpperCase() ?? "MP4"} — it autoplays in the
                timeline, where the PNG can&apos;t show the reveal at all.
              </p>
            </div>
          )}

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
              {isCrew
                ? "Name the crew and every member to unlock download."
                : "Add your name to unlock download."}
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
 * The rarity tier, beside whatever it applies to.
 *
 * COMMON stays deliberately quiet — it's four cards in five, and shouting about
 * it would make the other two mean less. RARE and MYTHIC take the same colours
 * the card's own foil does.
 */
function TierPip({ tier }: { tier: Tier }) {
  const style: Record<Tier, string> = {
    COMMON: "border-paper/25 text-paper/45",
    RARE: "border-yellow/70 bg-yellow/15 text-yellow",
    MYTHIC: "border-pink/70 bg-pink/20 text-pink",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[9px] tracking-[0.2em] ${style[tier]}`}
    >
      {tier}
    </span>
  );
}

/**
 * SOLO / CREW.
 *
 * A segmented control rather than a link to a second page: the two modes share
 * a photo and a name, and switching should feel like changing the print, not
 * starting over.
 */
function ModeToggle(props: {
  mode: Mode;
  onSolo: () => void;
  onCrew: () => void;
}) {
  const tab = (active: boolean) =>
    `flex-1 rounded-full px-5 py-2.5 font-mono text-xs font-bold tracking-widest transition ${
      active
        ? "bg-yellow text-green-ink"
        : "text-paper/60 hover:text-paper"
    }`;

  return (
    <div
      role="tablist"
      aria-label="Pass type"
      className="flex gap-1 rounded-full border border-paper/20 bg-green-deep/85 p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={props.mode === "solo"}
        onClick={props.onSolo}
        className={tab(props.mode === "solo")}
      >
        SOLO
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={props.mode === "crew"}
        onClick={props.onCrew}
        className={tab(props.mode === "crew")}
      >
        CREW ↗
      </button>
    </div>
  );
}

/**
 * The team roster: 2–3 people, a photo and a name each.
 *
 * Name only, per member, rather than the solo card's four fields. The builder
 * class is seeded from the name either way, so each member still mints a
 * distinct one — and asking three people for a role, a stack and a handle is
 * how a combined frame stops being something anyone finishes.
 *
 * Each slot gets the same `PhotoFramer` the solo flow does, since a crew tile is
 * narrower than the solo window and the auto-crop has more chance to be wrong.
 */
function CrewRoster(props: {
  team: string;
  onTeam: (v: string) => void;
  members: Member[];
  crops: (PhotoSource | null)[];
  classes: string[];
  tiers: Tier[];
  onName: (id: number, v: string) => void;
  onFile: (id: number, f: File | undefined) => void;
  onAdjust: (id: number, next: Adjust) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field
        label="CREW NAME"
        value={props.team}
        onChange={props.onTeam}
        placeholder="tide runners"
        maxLength={24}
      />

      {props.members.map((member, i) => (
        <div
          key={member.id}
          className="flex flex-col gap-4 rounded-xl border border-paper/15 bg-green-deep/85 p-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[0.3em] text-paper/50">
              MEMBER {String(i + 1).padStart(2, "0")}
            </p>
            {props.members.length > CREW_MIN && (
              <button
                type="button"
                onClick={() => props.onRemove(member.id)}
                className="font-mono text-[10px] tracking-widest text-pink underline"
              >
                REMOVE
              </button>
            )}
          </div>

          <Field
            label="NAME"
            value={member.name}
            onChange={(v) => props.onName(member.id, v)}
            placeholder="their name"
            maxLength={22}
          />

          <Dropzone
            hasPhoto={!!member.photo}
            dragOver={false}
            onDragState={() => {}}
            onFile={(f) => props.onFile(member.id, f)}
          />

          {member.photo && props.crops[i] && (
            <PhotoFramer
              photo={member.photo}
              crop={props.crops[i]}
              adjust={member.adjust}
              onAdjust={(next) => props.onAdjust(member.id, next)}
            />
          )}

          {member.name.trim() && (
            <p className="flex items-center gap-2 font-mono text-xs tracking-widest text-yellow">
              <span className="truncate">{props.classes[i]}</span>
              <TierPip tier={props.tiers[i]} />
            </p>
          )}
        </div>
      ))}

      {props.members.length < CREW_MAX && (
        <button
          type="button"
          onClick={props.onAdd}
          className="rounded-xl border border-dashed border-paper/25 px-5 py-4 font-mono text-xs font-bold tracking-widest text-paper/70 transition hover:border-paper/60 hover:text-paper"
        >
          + ADD A THIRD BUILDER
        </button>
      )}
    </div>
  );
}

/**
 * Nudge the auto-crop when it guesses wrong.
 *
 * `computeCrop` has taken `{ zoom, offsetX, offsetY }` since it was written and
 * nothing ever passed them — the subject-aware crop was the only framing on
 * offer, and when it missed (a group shot, a subject in the corner) the user was
 * stuck with the result. The brief's "don't assume users will crop first" is
 * what auto-crop answers; this is the escape hatch for when it's wrong.
 *
 * The rectangle is dragged directly over a thumbnail of the whole photo rather
 * than over the card, because drag on the card is already the tilt fallback on
 * touch devices — taking it for cropping would break the reveal on exactly the
 * phones that have no motion sensor.
 *
 * Everything is expressed as a fraction of the crop window, so the overlay is
 * resolution-independent and `computeCrop`'s existing clamp stops the drag at
 * the edges of the image for free.
 */
function PhotoFramer(props: {
  photo: LoadedPhoto;
  crop: PhotoSource;
  adjust: Adjust;
  onAdjust: (next: Adjust) => void;
}) {
  const { photo, crop, adjust, onAdjust } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /* the thumbnail only has to be sharp at ~280 CSS px wide */
    const w = 560;
    const h = Math.max(1, Math.round((w * photo.height) / photo.width));
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo.source, 0, 0, w, h);
  }, [photo]);

  const pct = (n: number) => `${n * 100}%`;

  const move = (dxPx: number, dyPx: number) => {
    const box = frameRef.current;
    if (!box) return;

    /* screen px -> image px -> fractions of the crop window, which is the unit
       `computeCrop` offsets in */
    const perPxX = photo.width / box.clientWidth;
    const perPxY = photo.height / box.clientHeight;

    onAdjust({
      ...adjust,
      offsetX: adjust.offsetX + (dxPx * perPxX) / crop.sw,
      offsetY: adjust.offsetY + (dyPx * perPxY) / crop.sh,
    });
  };

  const touched =
    adjust.zoom !== AUTO_CROP.zoom ||
    adjust.offsetX !== AUTO_CROP.offsetX ||
    adjust.offsetY !== AUTO_CROP.offsetY;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-paper/15 bg-green-deep/85 p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.3em] text-paper/50">
          FRAMING {touched ? "· NUDGED" : "· AUTO"}
        </p>
        {touched && (
          <button
            type="button"
            onClick={() => onAdjust(AUTO_CROP)}
            className="font-mono text-[10px] tracking-widest text-yellow underline"
          >
            RESET
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div
          ref={frameRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            move(e.clientX - drag.current.x, e.clientY - drag.current.y);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          className="relative w-[180px] shrink-0 cursor-grab touch-none overflow-hidden rounded-lg active:cursor-grabbing"
        >
          <canvas ref={canvasRef} className="block w-full" />
          {/* the spread shadow dims everything outside the window in one pass,
              clipped by the wrapper's overflow-hidden */}
          <div
            className="pointer-events-none absolute rounded-[3px] border-2 border-yellow shadow-[0_0_0_9999px_rgba(8,40,29,0.62)]"
            style={{
              left: pct(crop.sx / photo.width),
              top: pct(crop.sy / photo.height),
              width: pct(crop.sw / photo.width),
              height: pct(crop.sh / photo.height),
            }}
          />
        </div>

        <div className="min-w-[140px] flex-1">
          <label className="font-mono text-[10px] tracking-[0.3em] text-paper/50">
            ZOOM {adjust.zoom.toFixed(2)}×
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={adjust.zoom}
            onChange={(e) => onAdjust({ ...adjust, zoom: Number(e.target.value) })}
            className="mt-2 w-full accent-yellow"
          />
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-paper/45">
            Drag the box to move the crop. We centre on the face by default.
          </p>
        </div>
      </div>
    </div>
  );
}

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
    <div className="flex flex-col gap-3 rounded-xl border border-paper/15 bg-green-deep/85 p-4">
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
        className="mt-1.5 w-full rounded-lg border border-paper/20 bg-green-deep/90 px-4 py-3 font-mono text-base text-paper outline-none transition placeholder:text-paper/30 focus:border-yellow"
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
