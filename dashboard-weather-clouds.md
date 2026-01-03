---
<pre class="overflow-visible! px-0!" data-start="252" data-end="3439"><div class="contain-inline-size rounded-2xl corner-superellipse/1.1 relative bg-token-sidebar-surface-primary"><div class="sticky top-[calc(--spacing(9)+var(--header-height))] @w-xl/main:top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-md"><span><span># iPad Home Dashboard — Cloud &amp; Weather Theme (Landscape)</span><span>

</span><span>## Goal</span><span>
Build a full-screen, landscape-oriented web dashboard for an old iPad that acts as a </span><span>**weather-aware, cloud-themed home dashboard**</span><span>.  
The design should be </span><span>**calm, realistic, and polished**</span><span>, not “smart mirror hobbyist.”

This is </span><span>**Phase 1 only**</span><span>:
</span><span>-</span><span> No sensors
</span><span>-</span><span> No wake logic
</span><span>-</span><span> Always-on dashboard
</span><span>-</span><span> Optimized for Safari on iPad
---
`<span>`## Design Inspiration`<span>`
Use this CodePen as the `<span>`**visual and animation reference**`<span>`, not literal code copying:
https://codepen.io/BalintFerenczy/pen/qENdpoL

Key ideas to extract:
`<span>`-`<span>` Realistic, soft, volumetric cloud look
`<span>`-`<span>` Subtle motion (slow drift, parallax)
`<span>`-`<span>` Clouds feel “physical,” not cartoony
`<span>`-`<span>` Light changes based on time/weather

---

`<span>`## Target Device`<span>`
`<span>`-`<span>` iPad (older model OK)
`<span>`-`<span>` Landscape orientation only
`<span>`-`<span>` Safari browser
`<span>`-`<span>` Resolution should scale responsively (no hard-coded px for one model)

---

`<span>`## Location &amp; Context`<span>`
`<span>`-`<span>` Location: `<span>`**Bala Cynwyd, PA 19004**`<span>`
`<span>`-`<span>` Dashboard should reflect:
`<span>`  -`<span>` Local weather
`<span>`  -`<span>` Local time
`<span>`  -`<span>` Day vs night
`<span>`  -`<span>` Cloud cover / rain / clear sky

---

`<span>`## Visual Theme`<span>`
`<span>`**Overall mood**`<span>`
`<span>`-`<span>` Calm, modern, atmospheric
`<span>`-`<span>` Inspired by real sky and weather systems
`<span>`-`<span>` No sharp UI chrome, no heavy borders

`<span>`**Background**`<span>`
`<span>`-`<span>` Full-screen animated cloud layer
`<span>`-`<span>` Sky color changes by time:
`<span>`  -`<span>` Day: blue / soft white
`<span>`  -`<span>` Sunset: warm gradients
`<span>`  -`<span>` Night: dark blue / near-black with subtle glow
`<span>`-`<span>` Clouds:
`<span>`  -`<span>` SVG + CSS or Canvas-based
`<span>`  -`<span>` Slow, natural motion
`<span>`  -`<span>` Opacity and density driven by weather data

`<span>`**Lighting**`<span>`
`<span>`-`<span>` Brightness and contrast adjust automatically:
`<span>`  -`<span>` Clear day → brighter, fewer clouds
`<span>`  -`<span>` Overcast → flatter light, dense clouds
`<span>`  -`<span>` Night → darker sky, very subtle cloud motion

---

`<span>`## Weather Integration`<span>`
Use a weather API (OpenWeatherMap or similar).

Weather data required:
`<span>`-`<span>` Current condition (clear, clouds, rain, snow)
`<span>`-`<span>` Cloud cover %
`<span>`-`<span>` Temperature
`<span>`-`<span>` Sunrise / sunset times
`<span>`-`<span>` Local time

Weather should affect:
`<span>`-`<span>` Cloud density
`<span>`-`<span>` Cloud speed
`<span>`-`<span>` Sky color
`<span>`-`<span>` Optional subtle rain animation (very light, no heavy particles)

---

`<span>`## Layout (Landscape)`<span>`

`<span>`### Left / Center (Primary Visual)`<span>`
`<span>`-`<span>` Clouds + sky dominate the screen
`<span>`-`<span>` This is the “emotional” part of the dashboard

`<span>`### Top-left or Top-center`<span>`
`<span>`-`<span>` Large current time (HH:MM)
`<span>`-`<span>` Smaller date below it
`<span>`-`<span>` Clean typography (no bold digital clock look)

`<span>`### Bottom-left or Bottom-center`<span>`
`<span>`-`<span>` Weather summary:
`<span>`  -`<span>` Icon (minimal, outline)
`<span>`  -`<span>` Temperature
`<span>`  -`<span>` Short condition text (e.g. “Overcast”, “Light rain”)

`<span>`### Right Side (Secondary Content)`<span>`
`<span>`-`<span>` Placeholder panel for:
`<span>`  -`<span>` Calendar events (today only)
`<span>`  -`<span>` Text-only for now
`<span>`  -`<span>` This can be mocked with dummy data

Do NOT overcrowd the screen.

---

`<span>`## Photos (Phase 1 – Placeholder)`<span>`
`<span>`-`<span>` Do NOT integrate Apple Photos yet
`<span>`-`<span>` Just include a placeholder component or comment where photos will go later
`<span>`-`<span>` This will be replaced in a future phase

---

`<span>`## Animation Requirements`<span>`
`<span>`-`<span>` Subtle, slow, continuous
`<span>`-`<span>` No fast loops
`<span>`-`<span>` No distracting motion
`<span>`-`<span>` iPad-friendly performance:
`<span>`  -`<span>` Avoid heavy WebGL unless necessary
`<span>`  -`<span>` Prefer CSS/SVG/Canvas
`<span>`-`<span>` Respect reduced motion if possible

---

`<span>`## Technical Requirements`<span>`

`<span>`### Structure`<span>`
Use a simple structure:
`</code></div>``</div></pre>`

/dashboard

├── index.html

├── styles.css

├── clouds.js

└── weather.js

<pre class="overflow-visible! px-0!" data-start="3518" data-end="4416"><div class="contain-inline-size rounded-2xl corner-superellipse/1.1 relative bg-token-sidebar-surface-primary"><div class="sticky top-[calc(--spacing(9)+var(--header-height))] @w-xl/main:top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre!"><span><span>
</span><span>### Tech</span><span>
</span><span>-</span><span></span><span>Plain</span><span></span><span>HTML</span><span></span><span>/</span><span></span><span>CSS</span><span></span><span>/</span><span></span><span>JavaScript</span><span>
</span><span>-</span><span></span><span>No</span><span></span><span>React</span><span></span><span>required</span><span>
</span><span>-</span><span></span><span>No</span><span></span><span>build</span><span></span><span>step</span><span>
</span><span>-</span><span></span><span>No</span><span></span><span>external</span><span></span><span>frameworks</span><span></span><span>unless</span><span></span><span>clearly</span><span></span><span>justified</span><span>

</span><span>### Safari Compatibility</span><span>
</span><span>-</span><span></span><span>Must</span><span></span><span>work</span><span></span><span>in</span><span></span><span>iPad</span><span></span><span>Safari</span><span>
</span><span>-</span><span></span><span>Avoid</span><span></span><span>experimental</span><span></span><span>APIs</span><span>
</span><span>-</span><span></span><span>Use</span><span></span><span>requestAnimationFrame</span><span></span><span>responsibly</span><span>

---

</span><span>## Behavior</span><span>
</span><span>-</span><span></span><span>Dashboard</span><span></span><span>loads</span><span></span><span>immediately</span><span>
</span><span>-</span><span></span><span>Weather</span><span></span><span>refresh</span><span></span><span>every</span><span></span><span>~10</span><span></span><span>minutes</span><span>
</span><span>-</span><span></span><span>Animations</span><span></span><span>continue</span><span></span><span>indefinitely</span><span>
</span><span>-</span><span></span><span>No</span><span></span><span>user</span><span></span><span>interaction</span><span></span><span>required</span><span>

---

</span><span>## Out of Scope (Do NOT implement)</span><span>
</span><span>-</span><span></span><span>Motion</span><span></span><span>sensors</span><span>
</span><span>-</span><span></span><span>Wake/sleep</span><span></span><span>logic</span><span>
</span><span>-</span><span></span><span>HomeKit</span><span></span><span>/</span><span></span><span>Alexa</span><span>
</span><span>-</span><span></span><span>Face</span><span></span><span>recognition</span><span>
</span><span>-</span><span></span><span>Authentication</span><span>
</span><span>-</span><span></span><span>Photo</span><span></span><span>library</span><span></span><span>access</span><span>

---

</span><span>## Deliverables</span><span>
</span><span>1</span><span>.</span><span></span><span>Working</span><span></span><span>static</span><span></span><span>dashboard</span><span></span><span>page</span><span>
</span><span>2</span><span>.</span><span></span><span>Cloud</span><span></span><span>animation</span><span></span><span>system</span><span>
</span><span>3</span><span>.</span><span></span><span>Weather-driven</span><span></span><span>visual</span><span></span><span>logic</span><span>
</span><span>4</span><span>.</span><span></span><span>Clean,</span><span></span><span>readable</span><span></span><span>code</span><span></span><span>with</span><span></span><span>comments</span><span>
</span><span>5</span><span>.</span><span></span><span>Easy</span><span></span><span>to</span><span></span><span>extend</span><span></span><span>later</span><span>

---

</span><span>## Success Criteria</span><span>
</span><span>-</span><span></span><span>Looks</span><span></span><span>calm</span><span></span><span>and</span><span></span><span>professional</span><span>
</span><span>-</span><span></span><span>Feels</span><span></span><span>“alive”</span><span></span><span>but</span><span></span><span>not</span><span></span><span>distracting</span><span>
</span><span>-</span><span></span><span>Clearly</span><span></span><span>reflects</span><span></span><span>real</span><span></span><span>weather</span><span></span><span>&</span><span></span><span>time</span><span>
</span><span>-</span><span></span><span>Suitable</span><span></span><span>for</span><span></span><span>a</span><span></span><span>wall-mounted</span><span></span><span>iPad</span></span></code></div></div></pre>
