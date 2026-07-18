# Crayon rendering

The default `paper-tooth` crayon turns each recorded stroke into a crisp, low-alpha wax pattern. Its
coverage is a stable integer hash of paper-space pixel coordinates and a seed stored on the stroke
operation. New strokes get a new seed, so same-colour overlap fills previously empty tooth while
source-over compositing preserves the hue. The canvas geometry is still drawn through the shared
`renderOp()` path, keeping live ink, undo replay, resize, and export on one renderer.

`setCrayonRenderVariant('solid')` is a dev-harness A/B control. The shipping default is
`paper-tooth`.
