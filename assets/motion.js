/* Enduring motion. Pages re-render lists from Firebase on every change, so motion never runs on render.
   A handler queues an animation for the element the person acted on (Motion.after), the write fires,
   and the page's render() ends with Motion.flush(), which plays it on the freshly rendered element. */
const Motion = (() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const queue = [];

  function play(el, cls) {
    if (reduced.matches) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  function after(selector, cls) { queue.push([selector, cls]); }

  function flush() {
    while (queue.length) {
      const [selector, cls] = queue.shift();
      document.querySelectorAll(selector).forEach(el => play(el, cls));
    }
  }

  /* Collapse an element out, then resolve so the caller can write the delete. */
  function exit(el) {
    if (!el) throw new Error("Motion.exit needs an element");
    if (reduced.matches) return Promise.resolve();
    const h = el.offsetHeight;
    el.style.overflow = "hidden";
    return el.animate(
      [{ height: h + "px", opacity: 1, transform: "none" },
       { height: h + "px", opacity: 0, transform: "translateX(28px)", offset: .55 },
       { height: "0px", opacity: 0, transform: "translateX(28px)", paddingTop: "0px", paddingBottom: "0px" }],
      { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" }
    ).finished;
  }

  /* Reorder with motion: measure children keyed by a data attribute (data-id unless named), run the re-render, slide each from old spot to new. */
  function flip(container, rerender, key = "id") {
    if (!container) throw new Error("Motion.flip needs a container");
    if (reduced.matches) { rerender(); return; }
    const before = new Map();
    container.querySelectorAll(`:scope > [data-${key}]`).forEach(el => before.set(el.dataset[key], el.getBoundingClientRect().top));
    rerender();
    container.querySelectorAll(`:scope > [data-${key}]`).forEach(el => {
      const was = before.get(el.dataset[key]);
      if (was === undefined) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 }); return; }
      const dy = was - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" });
    });
  }

  return { after, flush, play, exit, flip };
})();
