/**
 * Space under a bottom-docked composer. Sits just above the gesture handle
 * (Android gesture bar or iPhone home indicator) instead of a full safe-area
 * inset above it; a tall inset (Android's 3-button bar) is kept in full so
 * the buttons stay clear.
 */
export function composerBottomInset(safeBottom: number, keyboardOpen: boolean): number {
  if (keyboardOpen) return 8;
  if (safeBottom >= 40) return safeBottom + 4;
  return Math.max(safeBottom - 14, 8);
}
