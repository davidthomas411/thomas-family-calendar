# Rain glass: reviewed implementation plan

Implements the brief in issue #1, preserving the family dashboard and the
`RainGlass.setWeather(code)` / `setMode(value)` API.

The previous version painted gradient circles. This version uses a WebGL2
fragment shader for stable beads, slow running drops, normals, sampled-image
refraction, and restrained condensation. It is confined to the weather/clock
area, with a feathered edge before the family calendar content.

WebGL cannot directly sample HTML. A locally bundled, MIT-licensed html2canvas
captures the existing dashboard to an in-memory texture only when needed:
activation, resize, weather/time changes. No snapshots are uploaded or saved.
The live DOM remains in place underneath the pointer-transparent overlay.
This can lag a changing clock by up to five seconds; it avoids rendering the
DOM into a texture on every animation frame.

A separate low-resolution grayscale canvas is the persistent wipe texture.
Mouse and touch pointer events paint soft, interpolated white strokes. The
shader uses its luminance to remove fog and droplets. Painting black with
exponential decay restores condensation over roughly a minute. This achieves
the brief's persistent spatial mask without an additional GPU framebuffer.

The render loop is capped at 30fps, effective DPR at 1.25, and the drawing
buffer at approximately 1.6 million pixels. Hidden tabs, offscreen weather,
and calendar/meal views pause rendering. Reduced motion freezes running drops
and automatic recovery, while direct wiping still works. Unsupported WebGL2
uses a static wipeable mist fallback with no optical refraction.

Resource cleanup covers listeners, observers, RAF, timers, textures, programs,
buffers and canvases; repeated initialization destroys the previous instance.
Context loss pauses and context restoration recreates GPU resources.

No rain sounds, lightning, demo settings panels, or new family-page status
badges are added. Automatic / Preview / Off remains the only effect control.

Validation: npm test, npm run check, browser checks for shader compilation,
pointer wiping, touch input, resize, reduced motion, navigation and controls.
Physical iPad GPU performance must ultimately be checked on the target iPad.
