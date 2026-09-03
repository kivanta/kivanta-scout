const hero = document.querySelector(".hero");

if (hero) {
  const supportsPointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (supportsPointer && !prefersReducedMotion) {
    hero.addEventListener(
      "pointermove",
      (event) => {
        const bounds = hero.getBoundingClientRect();

        const x = ((event.clientX - bounds.left) / bounds.width) * 100;

        const y = ((event.clientY - bounds.top) / bounds.height) * 100;

        hero.style.setProperty("--beam-x", `${x}%`);
        hero.style.setProperty("--beam-y", `${y}%`);
        hero.style.setProperty("--beam-opacity", "0.85");
      },
      { passive: true },
    );

    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--beam-opacity", "0.55");
    });

    hero.addEventListener("pointerenter", () => {
      hero.style.setProperty("--beam-opacity", "0.85");
    });
  }
}
