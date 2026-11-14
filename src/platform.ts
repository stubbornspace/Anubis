export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const interfaceScale = () =>
  Number(document.documentElement.style.getPropertyValue("--app-zoom")) || 1;

export const compactNavigation = (scale = interfaceScale()) =>
  window.innerWidth / scale <= (isIOS ? 900 : 600);
