/**
 * Vue Transition JS hooks for slide animation with dynamic max-height.
 * Replaces hardcoded max-height: 1000px with actual scrollHeight.
 * Usage: <Transition name="st-slide" v-bind="slideHooks">
 */
export function useSlideTransition() {
  function onEnter(el: Element) {
    const htmlEl = el as HTMLElement
    htmlEl.style.maxHeight = htmlEl.scrollHeight + 'px'
  }

  function onAfterEnter(el: Element) {
    const htmlEl = el as HTMLElement
    htmlEl.style.maxHeight = ''
  }

  function onBeforeLeave(el: Element) {
    const htmlEl = el as HTMLElement
    htmlEl.style.maxHeight = htmlEl.scrollHeight + 'px'
  }

  function onLeave(el: Element) {
    const htmlEl = el as HTMLElement
    // Force reflow so the browser registers the current max-height before transitioning to 0
    void htmlEl.offsetHeight
    htmlEl.style.maxHeight = '0'
  }

  function onAfterLeave(el: Element) {
    const htmlEl = el as HTMLElement
    htmlEl.style.maxHeight = ''
  }

  return {
    onEnter,
    onAfterEnter,
    onBeforeLeave,
    onLeave,
    onAfterLeave,
  }
}
