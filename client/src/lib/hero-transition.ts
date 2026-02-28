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

function restoreTeamsCards() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-hero-card]"));
  if (cards.length === 0) return false;

  cards.forEach((card) => {
    card.style.transition = "none";
    card.style.opacity = "0";
  });

  requestAnimationFrame(() => {
    cards.forEach((card) => {
      card.style.transition = "opacity 150ms ease";
      card.style.opacity = "1";
    });
  });
  return true;
}

export function runTeamCardHeroOpen(sourceEl: HTMLElement, navigate: () => void) {
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

  window.setTimeout(() => {
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

  if (contentEl) {
    contentEl.style.willChange = "transform, opacity";
    contentEl.style.transition = "opacity 160ms ease-in, transform 160ms ease-in";
    contentEl.style.opacity = "0";
    contentEl.style.transform = "translateY(6px)";
  }

  // Build a full-frame shell that visually matches the opened league container,
  // then collapse it back to the exact original team-card rect.
  const overlay = document.createElement("div");
  overlay.classList.add("hero-clone");
  overlay.style.position = "fixed";
  overlay.style.top = `${frameRect.top}px`;
  overlay.style.left = `${frameRect.left}px`;
  overlay.style.width = `${frameRect.width}px`;
  overlay.style.height = `${frameRect.height}px`;
  overlay.style.borderRadius = HERO_RADIUS;
  overlay.style.backgroundColor = "#080C10";
  overlay.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  overlay.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 6px 16px rgba(0, 0, 0, 0.25)";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "1200";
  overlay.style.transition = "none";
  overlay.style.willChange = "top, left, width, height, border-radius, opacity";
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // Let the content retreat first, then run the reverse collapse.
  const CONTENT_EXIT_MS = 160;
  const COLLAPSE_MS = 500;
  const FINAL_FADE_MS = 80;

  window.setTimeout(() => {
    navigateToTeams();

    commitNextFrame(() => {
      if (!activeOverlay || !originRect) return;
      activeOverlay.style.transition =
        `top ${COLLAPSE_MS}ms ${CLOSE_EASING}, left ${COLLAPSE_MS}ms ${CLOSE_EASING}, width ${COLLAPSE_MS}ms ${CLOSE_EASING}, ` +
        `height ${COLLAPSE_MS}ms ${CLOSE_EASING}, border-radius ${COLLAPSE_MS}ms ${CLOSE_EASING}, opacity ${FINAL_FADE_MS}ms linear`;
      activeOverlay.style.top = `${originRect.top}px`;
      activeOverlay.style.left = `${originRect.left}px`;
      activeOverlay.style.width = `${originRect.width}px`;
      activeOverlay.style.height = `${originRect.height}px`;
      activeOverlay.style.borderRadius = originRect.borderRadius || HERO_RADIUS;
    });

    window.setTimeout(() => {
      if (activeOverlay) activeOverlay.style.opacity = "0";
    }, COLLAPSE_MS - FINAL_FADE_MS);
  }, CONTENT_EXIT_MS);

  const tryRestore = (attempt = 0) => {
    if (restoreTeamsCards()) return;
    if (attempt < 4) window.setTimeout(() => tryRestore(attempt + 1), 60);
  };

  window.setTimeout(() => {
    tryRestore();
    activeOverlay?.remove();
    activeOverlay = null;
    setInteractionLocked(false);
  }, CONTENT_EXIT_MS + COLLAPSE_MS + 40);
}
