(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: r.x, y: r.y, w: r.width, h: r.height, display: cs.display, color: cs.color, opacity: cs.opacity, zIndex: cs.zIndex, position: cs.position };
  };
  const waves = [...document.querySelectorAll(".clip-wave")];
  return {
    waves: waves.length,
    wave: box(waves[0]),
    waveParent: waves[0]?.parentElement?.className || null,
    shade: box(document.querySelector(".clip-shade")),
    audioClip: box(document.querySelector(".clip.audio")),
    html: waves[0]?.outerHTML?.slice(0, 200) || null
  };
})();
