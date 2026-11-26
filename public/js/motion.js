// The site's motion rules. All motion uses the Web Animations API, a new animation on an element cancels the ones
// running on it, and nothing animates when the visitor asks for reduced motion. The reduced-motion rules in
// css/styles.css cover the CSS transitions and keyframe animations.

// Cancels the animations running on each element.
export function stopMotion(elements) {
  for (const element of elements) {
    for (const animation of element.getAnimations()) animation.cancel();
  }
}

// Cancels the animations running on each element and plays the keyframes on it with the options. The promise
// resolves once every new animation has finished or been cancelled, and at once under reduced motion, which starts
// no animation.
export function animate(elements, keyframes, options) {
  stopMotion(elements);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const animations = elements.map((element) => element.animate(keyframes, options));
  return Promise.allSettled(animations.map((animation) => animation.finished));
}
