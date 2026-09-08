# Rain glass: reviewed implementation plan

Implements the brief in issue #1, preserving the family dashboard and the
`RainGlass.setWeather(code)` / `setMode(value)` API.

The effect covers the full app, including calendar and kitchen views. WebGL2
provides beads, faster running drops, normals, sampled-image refraction, and
light condensation. Safari uses an animated Canvas 2D renderer to avoid WebKit
context-loss and DOM-snapshot dependencies. That renderer provides highlighted
beads, rivulets and persistent wiping, but does not optically refract the DOM.

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
buffer at approximately 1.6 million pixels. Hidden tabs pause rendering.
Reduced motion freezes running drops and automatic recovery, while direct
wiping still works. Unsupported WebGL2 and failed captures use the same animated
Canvas renderer as Safari. The fallback wipe alpha texture is reused between
mask updates, avoiding a per-frame image-data conversion.

Resource cleanup covers listeners, observers, RAF, timers, textures, programs,
buffers and canvases; repeated initialization destroys the previous instance.
Context loss switches to the animated Canvas renderer.

No rain sounds, lightning, demo settings panels, or new family-page status
badges are added. Automatic / Preview / Off remains the only effect control.

Validation: npm test and npm run check. Automated checks cover the Safari
renderer selection, full-screen touch wiping, motion preferences, navigation,
cleanup and unsupported WebGL. Physical Safari/iPad performance has not been
tested in this Windows environment.
