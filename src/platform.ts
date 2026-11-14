export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const compactNavigation = () => window.innerWidth <= (isIOS ? 900 : 600);
