# Crayon brush

The default brush is a wax crayon rather than an opaque pen. `crayonBrush.ts` creates one small,
fixed-seed value-noise alpha tile at runtime. Each stroke records its own deterministic phase, so
the tooth stays continuous within a stroke while the next stroke samples different gaps.

The tile carries the selected colour unchanged; only its alpha varies. Source-over compositing then
builds opacity in the newly covered tooth on an overlapping same-colour pass, instead of using a
darkening blend mode. The shared `renderOp()` renderer receives the stored phase for live drawing,
undo, resize, and export, preserving the engine's replay model.

`setBrushVariant('solid')` remains available only through the dev engine harness for A/B comparison.
Crayon is the default production variant.
