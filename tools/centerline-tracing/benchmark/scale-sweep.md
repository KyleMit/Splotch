# Raster scale, swept and auto-pruned

The measurement behind the `--scale` default. Conclusions and what to do with them:
[`docs/tuning.md`](../docs/tuning.md).

Generated 2026-08-07 21:52:44 · 917.9s · `medial-axis` + piecewise width · pruning λ 0.0..10.0,
selected automatically per cell.

Error is symmetric difference as a fraction of source ink, measured *after* automatic width-aware
pruning — so a scale is judged on what survives cleanup, not on its raw skeleton. Lower is better.

## Reconstruction error after auto-pruning

| image            | scale 1 | scale 2    | scale 4    | scale 8    | scale 16   |
| ---------------- | ------- | ---------- | ---------- | ---------- | ---------- |
| house-wide       | 0.0386  | 0.0183     | **0.0148** | 0.0178     | 0.0177     |
| butterfly-wide   | 0.0346  | 0.0240     | 0.0142     | **0.0131** | 0.0188     |
| boat-tall        | 0.0591  | 0.0252     | 0.0160     | 0.0139     | **0.0135** |
| island-tall      | 0.0456  | 0.0315     | 0.0217     | 0.0190     | **0.0183** |
| balloon-tall     | 0.0523  | 0.0290     | 0.0205     | 0.0188     | **0.0179** |
| home-wide        | 0.0473  | 0.0282     | 0.0243     | 0.0225     | **0.0224** |
| house-tall       | 0.0443  | 0.0294     | 0.0184     | **0.0175** | 0.0187     |
| dinosaur-wide    | 0.0391  | 0.0211     | 0.0162     | **0.0157** | --         |
| landscape-square | 0.0313  | **0.0244** | 0.0268     | 0.0279     | 0.0286     |
| sun-square       | 0.0321  | **0.0246** | 0.0390     | 0.0447     | 0.0412     |

## Wobble after auto-pruning (product goal: lower is smoother)

| image            | scale 1 | scale 2 | scale 4    | scale 8    | scale 16   |
| ---------------- | ------- | ------- | ---------- | ---------- | ---------- |
| house-wide       | 0.0293  | 0.0250  | 0.0242     | 0.0217     | **0.0202** |
| butterfly-wide   | 0.0223  | 0.0186  | **0.0142** | 0.0154     | 0.0177     |
| boat-tall        | 0.0268  | 0.0206  | **0.0161** | 0.0163     | 0.0162     |
| island-tall      | 0.0269  | 0.0241  | 0.0215     | 0.0204     | **0.0201** |
| balloon-tall     | 0.0306  | 0.0239  | 0.0215     | 0.0198     | **0.0197** |
| home-wide        | 0.0298  | 0.0237  | 0.0247     | **0.0167** | 0.0185     |
| house-tall       | 0.0335  | 0.0295  | 0.0228     | **0.0198** | 0.0212     |
| dinosaur-wide    | 0.0235  | 0.0159  | 0.0121     | **0.0107** | --         |
| landscape-square | 0.0363  | 0.0219  | 0.0174     | 0.0178     | **0.0173** |
| sun-square       | 0.0455  | 0.0186  | 0.0126     | **0.0123** | 0.0129     |

## Control points per stroke width (editability; lower is leaner)

| image            | scale 1 | scale 2 | scale 4 | scale 8   | scale 16  |
| ---------------- | ------- | ------- | ------- | --------- | --------- |
| house-wide       | 4.13    | 4.97    | 2.59    | 2.10      | ** 2.06** |
| butterfly-wide   | 3.86    | 3.49    | 2.60    | ** 2.54** | 2.55      |
| boat-tall        | 3.07    | 3.05    | 1.83    | 1.41      | ** 1.39** |
| island-tall      | 3.26    | 3.21    | 2.15    | 1.74      | ** 1.73** |
| balloon-tall     | 3.07    | 2.96    | 1.85    | 1.54      | ** 1.52** |
| home-wide        | 3.29    | 3.63    | 2.43    | 1.76      | ** 1.75** |
| house-tall       | 3.66    | 3.66    | 2.59    | 2.22      | ** 2.18** |
| dinosaur-wide    | 3.55    | 3.18    | 1.83    | ** 1.32** | --        |
| landscape-square | 4.15    | 3.10    | 1.72    | 1.58      | ** 1.57** |
| sun-square       | 4.56    | 3.95    | 2.24    | ** 2.08** | 2.12      |

## Branches kept after auto-pruning

| image            | scale 1 | scale 2 | scale 4  | scale 8 | scale 16 |
| ---------------- | ------- | ------- | -------- | ------- | -------- |
| house-wide       | ** 32** | 34      | 34       | 48      | 46       |
| butterfly-wide   | ** 23** | 25      | 43       | 38      | 28       |
| boat-tall        | ** 30** | ** 30** | 62       | 73      | 93       |
| island-tall      | ** 41** | 42      | 48       | 53      | 55       |
| balloon-tall     | ** 59** | 61      | 72       | 76      | 126      |
| home-wide        | 64      | 76      | ** 40**  | 127     | 198      |
| house-tall       | 53      | ** 52** | 104      | 139     | 190      |
| dinosaur-wide    | ** 63** | 88      | 99       | 152     | --       |
| landscape-square | 285     | 262     | ** 184** | 196     | 189      |
| sun-square       | 70      | 48      | ** 30**  | ** 30** | 43       |

## Selected pruning strength λ

| image            | scale 1   | scale 2   | scale 4   | scale 8   | scale 16  |
| ---------------- | --------- | --------- | --------- | --------- | --------- |
| house-wide       | ** 1.50** | 1.00      | 1.00      | 1.00      | 1.00      |
| butterfly-wide   | ** 1.50** | 1.00      | 0.00      | 0.50      | 1.00      |
| boat-tall        | ** 1.00** | ** 1.00** | 0.50      | 0.50      | 0.50      |
| island-tall      | ** 5.00** | 1.50      | 1.00      | 1.00      | 1.00      |
| balloon-tall     | ** 3.00** | 1.50      | 1.00      | 1.50      | 0.50      |
| home-wide        | 0.00      | 0.00      | ** 1.00** | 0.00      | 0.00      |
| house-tall       | ** 3.00** | 1.00      | 0.00      | 0.00      | 0.00      |
| dinosaur-wide    | ** 1.00** | 0.00      | 0.00      | 0.00      | --        |
| landscape-square | ** 0.50** | ** 0.50** | ** 0.50** | ** 0.50** | ** 0.50** |
| sun-square       | ** 1.50** | ** 1.50** | 1.00      | 1.00      | ** 1.50** |

## Extraction seconds

| image            | scale 1  | scale 2  | scale 4 | scale 8 | scale 16 |
| ---------------- | -------- | -------- | ------- | ------- | -------- |
| house-wide       | ** 5.8** | 6.4      | 9.6     | 31.1    | 171.8    |
| butterfly-wide   | ** 1.9** | 2.8      | 9.3     | 48.2    | 257.6    |
| boat-tall        | ** 3.1** | 3.6      | 9.2     | 41.4    | 210.4    |
| island-tall      | ** 2.5** | 3.1      | 4.6     | 15.9    | 86.3     |
| balloon-tall     | ** 2.9** | 3.4      | 6.2     | 20.3    | 117.5    |
| home-wide        | ** 2.5** | 2.5      | 4.7     | 12.3    | 63.9     |
| house-tall       | ** 2.9** | 3.3      | 6.2     | 20.1    | 103.2    |
| dinosaur-wide    | ** 3.9** | 5.3      | 17.1    | 75.8    | --       |
| landscape-square | ** 4.3** | 6.2      | 21.5    | 112.0   | 545.4    |
| sun-square       | 0.9      | ** 0.9** | 2.9     | 9.6     | 46.5     |

## Medians across all drawings

| scale | images | median err | median raw err (unpruned) | median wobble | median pts/width | median branches | median extract s |
| ----- | ------ | ---------- | ------------------------- | ------------- | ---------------- | --------------- | ---------------- |
| 1     | 10     | 0.0443     | 0.0405                    | 0.0298        | 3.66             | 59              | 2.9              |
| 2     | 10     | 0.0252     | 0.0242                    | 0.0237        | 3.49             | 52              | 3.4              |
| 4     | 10     | 0.0205     | 0.0188                    | 0.0215        | 2.24             | 62              | 9.2              |
| 8     | 10     | 0.0188     | 0.0176                    | 0.0178        | 1.76             | 76              | 31.1             |
| 16    | 9      | 0.0187     | 0.0176                    | 0.0185        | 1.75             | 93              | 117.5            |

## Cells with no result

* `dinosaur-wide@16` — never completed in 45 minutes. Extraction cost at scale 16 stops tracking the
  median once masks get large; this is a further practical argument against scale 16, not just a gap
  in the table.
