/**
 * Stop native wheel-to-step behavior for focused numeric fields without blocking
 * the wheel event, so the page can keep scrolling normally.
 */
export function blurFocusedNumberInputOnWheel(event: WheelEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement && target.type === "number" && document.activeElement === target) {
    target.blur()
  }
}
