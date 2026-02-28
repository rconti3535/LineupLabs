const OPEN_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const CLOSE_EASING = "cubic-bezier(0.4, 0, 1, 1)";
const HERO_RADIUS = "0.75rem";

type StoredRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
};

let originRect: StoredRect | null = null;
let activeClone: HTMLElement | null = null;
let activeOverlay: HTMLElement | null = null;

function getAppFrame(): HTMLElement | null {
  return document.getElementById("app-frame");
}

function getFrameRect(): DOMRect | null {
  const frame = getAppFrame();
  return frame ? frame.getBoundingClientRect() : null;
}

function setInteractionLocked(locked: boolean) {
  const frame = getAppFrame();
  if (!frame) return;
  frame.classList.toggle("hero-lock", locked);
}

function applyFrameClip(el: HTMLElement, frameRect: DOMRect) {
  const top = Math.max(0, frameRect.top);
  const left = Math.max(0, frameRect.left);
  const right = Math.max(0, window.innerWidth - frameRect.right);
  const bottom = Math.max(0, window.innerHeight - frameRect.bottom);
  el.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round 0px)`;
}

function commitNextFrame(cb: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

function buildVisualShellFromElement(sourceEl: HTMLElement, rect: DOMRect): HTMLElement {
  const sourceStyle = window.getComputedStyle(sourceEl);
  const shell = document.createElement("div");
  shell.classList.add("hero-clone");
  shell.style.position = "fixed";
  shell.style.top = `${rect.top}px`;
  shell.style.left = `${rect.left}px`;
  shell.style.width = `${rect.width}px`;
  shell.style.height = `${rect.height}px`;
  shell.style.margin = "0";
  shell.style.borderRadius = sourceStyle.borderRadius || "18px";
  shell.style.pointerEvents = "none";
  shell.style.zIndex = "1200";
  shell.style.overflow = "hidden";
  shell.style.transform = "translateZ(0)";
  shell.style.transition = "none";
  shell.style.willChange = "top, left, width, height, border-radius, opacity, background-color";
  shell.style.backgroundColor =
    sourceStyle.backgroundColor && sourceStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
      ? sourceStyle.backgroundColor
      : "#1a202a";
  shell.style.backgroundImage = sourceStyle.backgroundImage;
  shell.style.backgroundSize = sourceStyle.backgroundSize;
  shell.style.backgroundPosition = sourceStyle.backgroundPosition;
  shell.style.backgroundRepeat = sourceStyle.backgroundRepeat;
  shell.style.border = sourceStyle.border;
  shell.style.boxShadow = sourceStyle.boxShadow;
  shell.style.backdropFilter = sourceStyle.backdropFilter;
  shell.style.webkitBackdropFilter = (sourceStyle as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter || "";

  const tint = document.createElement("div");
  tint.setAttribute("data-hero-tint", "true");
  tint.style.position = "absolute";
  tint.style.inset = "0";
  tint.style.backgroundColor = "#080C10";
  tint.style.opacity = "0";
  tint.style.pointerEvents = "none";
  tint.style.transition = "none";
  shell.appendChild(tint);

  return shell;
}

function fadeTeamsCards(targetOpacity: number, durationMs: number, easing: string) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-hero-card]"));
  cards.forEach((card) => {
    card.style.transition = `opacity ${durationMs}ms ${easing}`;
    card.style.opacity = String(targetOpacity);
  });
}

export function runTeamCardHeroOpen(
  sourceEl: HTMLElement,
  navigate: () => void,
  prefetch?: () => Promise<void> | void
) {
  // Defensive cleanup in case a prior transition was interrupted.
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  if (activeClone) {
    activeClone.remove();
    activeClone = null;
  }

  const frameRect = getFrameRect();
  if (!frameRect) {
    navigate();
    return;
  }

  const rect = sourceEl.getBoundingClientRect();
  originRect = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: window.getComputedStyle(sourceEl).borderRadius || HERO_RADIUS,
  };

  const clone = buildVisualShellFromElement(sourceEl, rect);
  clone.style.top = `${rect.top}px`;
  clone.style.left = `${rect.left}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.borderRadius = originRect.borderRadius;
  clone.style.opacity = "1";
  document.body.appendChild(clone);
  activeClone = clone;
  // Force the browser to commit the exact start box before animating.
  clone.getBoundingClientRect();

  // Hide the tapped card content immediately so text does not linger during the zoom.
  sourceEl.style.transition = "opacity 1ms linear";
  sourceEl.style.opacity = "0";

  setInteractionLocked(true);
  fadeTeamsCards(0, 200, "ease");
  const prefetchPromise = prefetch
    ? Promise.resolve(prefetch()).catch(() => {
        // Prefetch is best-effort only; transition should never fail on it.
      })
    : Promise.resolve();

  requestAnimationFrame(() => {
    if (!activeClone) return;
    activeClone.style.transition =
      `top 500ms ${OPEN_EASING}, left 500ms ${OPEN_EASING}, width 500ms ${OPEN_EASING}, ` +
      `height 500ms ${OPEN_EASING}, border-radius 500ms ${OPEN_EASING}, background-color 500ms ${OPEN_EASING}`;
    activeClone.style.top = `${frameRect.top}px`;
    activeClone.style.left = `${frameRect.left}px`;
    activeClone.style.width = `${frameRect.width}px`;
    activeClone.style.height = `${frameRect.height}px`;
    activeClone.style.borderRadius = HERO_RADIUS;
    activeClone.style.backgroundColor = "#080C10";

    const tint = activeClone.querySelector<HTMLElement>("[data-hero-tint='true']");
    if (tint) {
      tint.style.transition = `opacity 500ms ${OPEN_EASING}`;
      tint.style.opacity = "1";
    }
  });

  window.setTimeout(async () => {
    // Keep the hero smooth, but hold briefly for warm cache so roster data appears
    // with the transition instead of popping in after route mount.
    await Promise.race([
      prefetchPromise,
      new Promise<void>((resolve) => window.setTimeout(resolve, 450)),
    ]);
    navigate();
  }, 520);
}

export function finalizeTeamCardHeroOpen(contentEl: HTMLElement | null) {
  if (!activeClone) return;

  if (contentEl) {
    contentEl.style.willChange = "transform, opacity";
    contentEl.style.opacity = "0";
    contentEl.style.transform = "translateY(8px)";
    contentEl.style.transition = "none";

  commitNextFrame(() => {
      if (!contentEl) return;
      contentEl.style.transition = "opacity 220ms ease-out, transform 220ms ease-out";
      contentEl.style.opacity = "1";
      contentEl.style.transform = "translateY(0)";
    });
  }

  window.setTimeout(() => {
    activeClone?.remove();
    activeClone = null;
    setInteractionLocked(false);
  }, 240);
}

export function runTeamCardHeroBack(contentEl: HTMLElement | null, navigateToTeams: () => void) {
  const frameRect = getFrameRect();
  if (!frameRect || !originRect) {
    navigateToTeams();
    return;
  }

  setInteractionLocked(true);

  if (!contentEl) {
    navigateToTeams();
    setInteractionLocked(false);
    return;
  }

  // Structural fix: animate the *actual* league surface instead of a clone.
  // This keeps live league/roster data attached to the shrinking card and
  // avoids flashes caused by route swap + overlay handoff.
  const liveRect = contentEl.getBoundingClientRect();
  contentEl.style.willChange = "top, left, width, height, border-radius, opacity";
  contentEl.style.position = "fixed";
  contentEl.style.top = `${liveRect.top}px`;
  contentEl.style.left = `${liveRect.left}px`;
  contentEl.style.width = `${liveRect.width}px`;
  contentEl.style.height = `${liveRect.height}px`;
  contentEl.style.margin = "0";
  contentEl.style.zIndex = "1200";
  contentEl.style.pointerEvents = "none";
  contentEl.style.transition = "none";
  contentEl.style.transform = "none";
  contentEl.style.opacity = "1";
  contentEl.getBoundingClientRect();

  const COLLAPSE_MS = 500;
  const FINAL_FADE_MS = 80;

  commitNextFrame(() => {
    if (!originRect) return;
    contentEl.style.transition =
      `top ${COLLAPSE_MS}ms ${CLOSE_EASING}, left ${COLLAPSE_MS}ms ${CLOSE_EASING}, width ${COLLAPSE_MS}ms ${CLOSE_EASING}, ` +
      `height ${COLLAPSE_MS}ms ${CLOSE_EASING}, border-radius ${COLLAPSE_MS}ms ${CLOSE_EASING}, opacity ${FINAL_FADE_MS}ms linear`;
    contentEl.style.top = `${originRect.top}px`;
    contentEl.style.left = `${originRect.left}px`;
    contentEl.style.width = `${originRect.width}px`;
    contentEl.style.height = `${originRect.height}px`;
    contentEl.style.borderRadius = originRect.borderRadius || HERO_RADIUS;
  });

  window.setTimeout(() => {
    contentEl.style.opacity = "0";
  }, COLLAPSE_MS - FINAL_FADE_MS);

  // Navigate only after reverse collapse fully reaches the original team-card box.
  window.setTimeout(() => {
    navigateToTeams();
    setInteractionLocked(false);
  }, COLLAPSE_MS + 20);
}
