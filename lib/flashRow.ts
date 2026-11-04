// Highlights a table row for two seconds (strong for the first 1.6 s, then fading out), and the one
// cell that changed if there is one. Used when a notification is clicked, so the person can see
// which task it was about. Plain Web Animations, so nothing is left behind on the page.
const orange = (a: number) => `rgba(254,74,35,${a})`;
const held = (strong: Keyframe, gone: Keyframe): Keyframe[] => [{ ...strong, offset: 0 }, { ...strong, offset: 0.8 }, { ...gone, offset: 1 }];

export const FLASH_MS = 2000;

export function flashRow(row: Element, cell?: string): void {
  row.querySelectorAll(':scope > td').forEach(td => td.animate(held({ backgroundColor: orange(0.16) }, { backgroundColor: orange(0) }), { duration: FLASH_MS }));
  if (cell) {
    row.querySelector(`[data-cell="${cell}"]`)?.animate(
      held({ backgroundColor: orange(0.5), outline: '2px solid #FE4A23', outlineOffset: '-2px' }, { backgroundColor: orange(0), outline: '2px solid transparent', outlineOffset: '-2px' }),
      { duration: FLASH_MS });
  }
}
