# Art-direction prototypes

These standalone HTML comps are deliberately isolated from the live React / three.js game. Open
`index.html` directly, or serve this directory with any static server. They compare four possible
visual systems against the same tribunal-corridor composition:

1. **Faceted shader pass** — preserve the procedural geometry, quantize light and color.
2. **Hand-painted replacement** — replace characters and author small diffuse texture atlases.
3. **Hybrid hero cast** — replace important NPCs, simplify the remaining cast, and standardize the world shader.
4. **Severe retro budget** — embrace visibly coarse geometry, nearest-neighbor texture sampling, and short fog.

The figures and rooms are CSS/SVG concept art, not production assets or changes to the renderer.
