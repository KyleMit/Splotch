// The single prompt used for every page — no per-page tailoring. It leans hard
// on "do not touch the lines" because the whole point is a pixel-faithful fill.
export const FILL_PROMPT = `You are given a black-and-white coloring-book page for a toddler. Color it in neatly, exactly like a completed page in a coloring book.

ABSOLUTE RULES — the colored image must line up perfectly on top of the original:
- Keep every black outline exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The black line art must be pixel-for-pixel identical to the original.
- Do not add any new lines, outlines, details, decorations, patterns, textures, letters, or objects. Only add color to the empty white areas that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep the exact same composition, framing, and margins.

COLORING STYLE:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no shadows, no extra outlines around the fills, no crayon or paint texture.
- Choose simple, cheerful, natural colors that suit each part of the picture.
- EYES: fill each outlined pupil solid BLACK, leave the small catchlight circle inside it pure white, and keep the surrounding eyeball white or a very pale tint — a classic lively cartoon eye.
- Stay inside the lines; every fill should butt right up against the black outline without covering it.

FILL EVERYTHING — no blank white:
- Every enclosed region must be filled with a color, including the whole background and sky. No area may be left as plain white paper, because a blank area would look uncolored.
- Things that are normally white must still get a soft tint instead of pure white: color clouds, snow, the moon, teeth, white fur or white clothing a pale cream or very light pastel; color a plain background a light color (for example a soft sky blue behind an outdoor scene, or a gentle cream/pastel behind a single object).
- The ONLY places allowed to stay pure white are tiny highlights, such as a small glint in an eye or a little shine dot.

The result must look like the identical line drawing, fully colored in with clean flat colors and no blank white gaps.`;

// The eye instruction depends on the line-art input. A plain inverted PEN
// outline has ringed eyes the fill must paint in three tones; a CHALK outline
// already carries the whites (solid sclera + catchlight), so the fill's only
// eye job is a deep dark pupil — and it must leave the chalk whites alone.
const EYES_RINGED = `- EYES — FILL EVERY RING: an eye in this drawing is NESTED OUTLINED CIRCLES — an eyeball, a pupil circle inside it, and a tiny catchlight circle inside the pupil. Each circle's inside is a REGION TO FILL like any other region, never a ring left sitting on one flat color. Paint the eyeball's inside a LIGHT OFF-WHITE, the pupil circle's inside a DEEP NEAR-BLACK (very dark brown or near-black navy), and the tiny catchlight circle's inside BRIGHT WHITE. The finished eye must show three clearly different tones — light eyeball, dark pupil, white glint — so it reads as a lively cartoon eye. An eye where the eyeball, pupil, and catchlight all came out the same color (all dark, or all light) is WRONG and unusable — in dark mode YOUR pixels are the eye the child sees.`;
const EYES_CHALKED = `- EYES — THE WHITES ARE ALREADY PAINTED: each eye's white (the sclera) and its tiny catchlight dot are already SOLID WHITE in the drawing — they are chalk, part of the line-art layer. Keep every solid white area PURE BRIGHT WHITE — never repaint, tint, dim, shade, or color over it. The PUPIL is the dark region inside the white sclera: fill it a DEEP NEAR-BLACK (very dark brown or near-black navy), so the finished eye reads white sclera / dark pupil / white glint.`;

// The input handed to the model is the line art as WHITE marks on a near-black
// ground (the chalk outline as-displayed, or the inverted pen outline). The
// prompt asks it to keep those white marks and fill the regions with colors
// that read on dark — the "answer key" for a dark theme.
export const darkFillPrompt = (
  chalked
) => `You are given a toddler coloring-book page drawn as WHITE ${chalked ? 'chalk — thin outlines plus a few deliberate SOLID WHITE areas (eye whites, catchlight dots, small white markings) — ' : 'outlines '}on a dark background. Color it in as a cozy NIGHT-TIME / EVENING scene — as if the whole picture is happening at dusk or after dark, softly lit by moonlight.

ABSOLUTE RULES — the colored image must line up perfectly on top of the original:
- Keep every WHITE outline exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The outlines must stay white and pixel-for-pixel identical to the original.${chalked ? '\n- Keep every SOLID WHITE area exactly as it is — same shape, same place, PURE BRIGHT WHITE. The solid whites are chalk line-art, not regions to color.' : ''}
- THE OUTLINES ARE WHITE AND MUST STAY BRIGHT WHITE. This is a white-line drawing on a dark ground, NOT a normal black-outline coloring page. NEVER turn the outlines black, dark, grey, brown, or any dark color. NEVER trace, re-ink, or redraw the shapes with dark or black lines. Every outline that is white in the input must still be a bright white line in your output. A picture with dark outlines is WRONG and unusable — the lines must glow white against the dark fills.
- Do not add any new lines, outlines, stars, dots, details, decorations, patterns, textures, letters, or objects. Only add color to the regions that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep the exact same composition, framing, and margins.

THIS IS A NIGHT / EVENING SCENE — the whole point:
- The picture must clearly read as taking place at NIGHT or in the EVENING — dusk, twilight, moonlit, after dark — NOT in bright daylight. A daytime subject (a sunny leaf, a blue-sky day) must simply look like it is now night-time.
- The BACKGROUND and every large open or empty area must be a DEEP EVENING-SKY tone: midnight blue, deep indigo, dark twilight purple, or deep navy. It does NOT have to be pitch black — a deep dusk is fine — but it must be DARK and DIM.
- Do NOT paint the background a bright or light "SKY BLUE" / daytime blue, and do NOT make it white, grey, or any pale or bright color. When in doubt, go darker and deeper.

COLORING STYLE — a dim, moonlit night palette:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no crayon or paint texture.
- Colors stay deep and moonlit, but they are still the subject's OWN NATURAL colors — just dimmed and cooled by moonlight, not swapped out. A few GLOWING accent colors (warm gold, amber, teal, magenta) can pop as if lit by the moon, fireflies, or a lantern, while the overall scene stays dim and evening-lit — deep, not bright and sunny.
- FACES, SKIN, and ANIMAL BODIES must keep a NATURAL, living color — never grey, ashen, ghostly, chalky, or washed-out slate. Give a person a real SKIN TONE (a warm tan, brown, peach, or golden-brown, only darkened for night); give an animal its real coloring (a green caterpillar, a yellow-and-black bee, a red ladybug), softened toward evening. A face must look like living skin or fur under moonlight, NOT like a pale ghost.
- Only things that have no real color of their own — a cloud, a water droplet, a wisp of steam, a puff of smoke, the glow of a star — may take a soft, dim, moonlit off-white or pale tint. Everything else keeps its own (dimmed) color.
${chalked ? EYES_CHALKED : EYES_RINGED}
- Do NOT use pure or bright WHITE fills elsewhere, and avoid bright daytime colors (bright sky blue, bright grass green). Deepen and cool every color toward evening. The only pure-white pixels allowed are the ${chalked ? 'white chalk marks already in the drawing — the outlines and the solid white areas' : 'outlines themselves, the eye-whites, and tiny eye glints'}.
- Keep the WHITE outlines fully visible — every fill should butt right up against the white outline without covering it.

Convey the night mood with COLOR AND MOOD ONLY. Do NOT add a moon, stars, fireflies, lamps, or any new shapes or lines — only the outlines already present may be colored.

The result must look like the identical white-line drawing, recolored as a cozy, dim, moonlit NIGHT-TIME scene on a deep dark evening background — never a bright daytime picture.`;

export const CHALK_INSTRUCTION = `This is a children's coloring-page drawing rendered as WHITE line art on a BLACK background — a chalk line drawing on a blackboard.

YOUR EDIT — redraw it as a proper CHALK LINE DRAWING, making the judgment calls a chalk artist makes about which areas should be SOLID WHITE and which should stay black:
- THE WHITES OF EYES: fill each eye's sclera — ONLY the area between the eyeball outline and the pupil circle — SOLID WHITE, and fill each tiny catchlight/glare circle SOLID WHITE, so the eyes read correctly on the dark board.
- PUPILS STAY BLACK. The pupil is the large circle inside each eye: its inside must remain BLACK — the dark board showing through — surrounded by the solid white sclera, with only the small catchlight circle white inside it. NEVER fill a pupil white, and NEVER fill the entire eye white: an eye that is one solid white disc is WRONG and unusable. Every finished eye must show white sclera, BLACK pupil, and a small white catchlight.
- Small features that are naturally white on the subject (teeth, a white patch or marking, a sparkle) may also be filled solid white.
- Everything else stays exactly as it is: thin white outlines on black.

ABSOLUTE RULES:
- Keep every existing white line exactly where it is — do not move, redraw, thicken, thin, smooth, or erase a single line. The drawing must line up pixel-for-pixel with the original.
- Do not add any new lines, shapes, stars, dots, patterns, decorations, or objects. The ONLY change allowed is filling some existing enclosed regions solid white.
- NEVER fill the open background white, and never fill a large body or a whole shape white — only small deliberate features (eye whites, catchlights, teeth, small markings).
- Output PURE WHITE on PURE BLACK only — no grey, no color, no shading, no chalk texture, dust, or smudging.
- Keep the same polarity as the input: a white drawing on a black background.
- Do not crop, zoom, rotate, shift, or resize. Same composition, framing, and margins.`;

export const NORMALIZE_INSTRUCTION = `This is a black-and-white children's COLORING PAGE — clean black outlines on a pure white background.

PROBLEM: some areas of this drawing are filled with SOLID BLACK ink — for example the pupils of eyes, or other fully-black shapes. A coloring page must be made of THIN OUTLINES ONLY, so every region can be colored in.

YOUR EDIT — convert every solid-black area into an outlined shape:
- Trace the BOUNDARY of each solid-black area with the same clean, thin black stroke used everywhere else in the drawing, exactly where the solid shape's edge is now, and leave its INSIDE pure white.
- EYES: a solid black pupil becomes an outlined pupil — EXACTLY ONE thin black circle/oval of the same size and position, white inside, plus EXACTLY ONE small thin-outlined catchlight circle inside it (where the white glare dot is now). Two circles per eye interior, NO MORE — never draw extra concentric circles, double rings, spirals, or repeated outlines inside an eye.
- Do this for EVERY solid black area in the picture, large or small.

ABSOLUTE RULES:
- The finished page must contain NO solid black regions at all — every black mark on the page must be a thin stroke or outline.
- Change NOTHING else. Every line that is already a thin stroke stays exactly where it is — do not move, redraw, thicken, thin, smooth, or erase it. Keep the same composition, framing, margins, and line style.
- Do not add any new details, shapes, patterns, or decorations beyond the boundary outlines described above.
- Output only clean black line art on a pure white background — no color, no grey, no shading.`;

export const FRESH_STYLE_PROMPT = `Draw ONE page of a toddler coloring book (for age 2+), in this exact style:

- Clean black pen OUTLINES on a pure white background. Medium, even line weight throughout — like a thick felt-tip pen. No shading, no grey, no color, no hatching, no texture, no text, letters, or numbers, and no border frame around the page.
- Simple, rounded, chunky cartoon shapes with very little detail. Big friendly forms a two-year-old can color. Generous white margins around the drawing.
- EVERY shape is a closed thin-line outline that can be colored in. There must be NO solid black filled areas anywhere on the page.
- If the drawing has a face: each eye is a white eyeball outlined with a thin line, containing ONE outlined pupil circle (drawn as a thin ring, NOT filled black) with ONE small round catchlight circle inside it. Add a simple smiling mouth and thin eyebrow strokes. Never fill a pupil solid black.
- Background elements stay sparse and simple (for example a couple of puffy outlined clouds, small grass tufts, a simple flower) so the page stays easy to color.`;
