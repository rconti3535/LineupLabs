const OPEN_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const CLOSE_EASING = "cubic-bezier(0.4, 0, 1, 1)";

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
  const frameRect = getFrameRect();
  if (!frameRect) {
    navigate();
    return;
  }

  const rect = sourceEl.getBoundingClientRect();
  const sourceStyle = window.getComputedStyle(sourceEl);
  originRect = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: sourceStyle.borderRadius || "18px",
  };

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.classList.remove("fade-up-enter");
  clone.classList.add("hero-clone");
  clone.style.position = "fixed";
  clone.style.top = `${rect.top}px`;
  clone.style.left = `${rect.left}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = "0";
  clone.style.borderRadius = originRect.borderRadius;
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "1200";
  clone.style.overflow = "hidden";
  clone.style.transform = "none";
  clone.style.transition = "none";
  clone.style.backgroundColor = sourceStyle.backgroundColor;
  clone.style.willChange = "top, left, width, height, border-radius, opacity, background-color";
  applyFrameClip(clone, frameRect);
  document.body.appendChild(clone);
  activeClone = clone;

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
    activeClone.style.borderRadius = "0px";
    activeClone.style.backgroundColor = "#080C10";
  });

  window.setTimeout(() => {
    navigate();
  }, 480);
}

export function finalizeTeamCardHeroOpen(contentEl: HTMLElement | null) {
  if (!activeClone) return;

  if (contentEl) {
    contentEl.style.willChange = "transform, opacity";
    contentEl.style.opacity = "0";
    contentEl.style.transform = "translateY(8px)";
    contentEl.style.transition = "none";

    requestAnimationFrame(() => {
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

  const overlay = document.createElement("div");
  overlay.classList.add("hero-clone");
  overlay.style.position = "fixed";
  overlay.style.top = `${frameRect.top}px`;
  overlay.style.left = `${frameRect.left}px`;
  overlay.style.width = `${frameRect.width}px`;
  overlay.style.height = `${frameRect.height}px`;
  overlay.style.borderRadius = "0px";
  overlay.style.backgroundColor = "#080C10";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "1200";
  overlay.style.transition = "none";
  overlay.style.willChange = "top, left, width, height, border-radius, opacity";
  applyFrameClip(overlay, frameRect);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  window.setTimeout(() => {
    navigateToTeams();
  }, 20);

  requestAnimationFrame(() => {
    if (!activeOverlay || !originRect) return;
    activeOverlay.style.transition =
      `top 420ms ${CLOSE_EASING}, left 420ms ${CLOSE_EASING}, width 420ms ${CLOSE_EASING}, ` +
      `height 420ms ${CLOSE_EASING}, border-radius 420ms ${CLOSE_EASING}, opacity 80ms linear`;
    activeOverlay.style.top = `${originRect.top}px`;
    activeOverlay.style.left = `${originRect.left}px`;
    activeOverlay.style.width = `${originRect.width}px`;
    activeOverlay.style.height = `${originRect.height}px`;
    activeOverlay.style.borderRadius = originRect.borderRadius || "18px";
  });

  window.setTimeout(() => {
    if (activeOverlay) activeOverlay.style.opacity = "0";
  }, 340);

  const tryRestore = (attempt = 0) => {
    if (restoreTeamsCards()) return;
    if (attempt < 4) window.setTimeout(() => tryRestore(attempt + 1), 60);
  };

  window.setTimeout(() => {
    tryRestore();
    activeOverlay?.remove();
    activeOverlay = null;
    setInteractionLocked(false);
  }, 420);
}
