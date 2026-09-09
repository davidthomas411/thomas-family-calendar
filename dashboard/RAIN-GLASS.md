# Rain glass: reviewed implementation plan

Implements the brief in issue #1, preserving the family dashboard and the
`RainGlass.setWeather(code)` / `setMode(value)` API.

The effect covers the full app, including calendar and kitchen views. WebGL2
provides beads, faster running drops, normals, sampled-image refraction, and
light condensation. Safari uses a WebGL 1 translation of the same refractive
shader, rather than being forced onto Canvas 2D. It uses standard derivatives
when supported, or finite differences otherwise. Other browsers try WebGL 2
and then the compatible WebGL 1 path. Both sample the dashboard texture.

The full-screen fog is deliberately faint, especially on Safari, so it does not
wash out text and panels. Refraction and contrast sit in the drops and rivulets;
the shader uses a neutral blue-gray tint instead of a white veil.

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
wiping still works. Canvas 2D is only the last resort when neither shader can
start or graphics recovery repeatedly fails. Failed DOM captures keep the shader
and last usable texture; a sky gradient supplies the initial texture while DOM
capture retries. Safari snapshots use a lower capture scale to reduce memory.

Resource cleanup covers listeners, observers, RAF, timers, textures, programs,
buffers and canvases; repeated initialization destroys the previous instance.
Context loss pauses drawing. Restoration rebuilds the shader; if no restoration
arrives after 1.5 seconds, a new canvas retries the full renderer (bounded to
two recovery attempts). Destroy also cancels pending recovery.

No rain sounds, lightning, demo settings panels, or new family-page status
badges are added. Automatic / Preview / Off remains the only effect control.

Validation: npm test and npm run check. Automated checks cover the Safari
refractive renderer selection, full-screen touch wiping, motion preferences,
capture failure, context restoration, cleanup and unsupported WebGL. Physical Safari/iPad performance has not been
tested in this Windows environment.
