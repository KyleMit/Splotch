#!/usr/bin/env node
// Deterministic SVG -> raw single-channel mask rasterizer.
//
// Reads a JSON job list on stdin:
//   { "jobs": [ { "svg": "<svg .../>", "width": 800, "height": 600, "out": "/tmp/a.raw" } ] }
// Writes width*height uint8 bytes (the red channel; masks are painted white on
// black) to each `out`, and prints a JSON summary on stdout.
//
// resvg is used rather than sharp/cairosvg because the report calls out
// deterministic, platform-stable rendering as a requirement for reproducible
// scoring.
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const { jobs } = JSON.parse(await readStdin());
  const out = [];
  for (const job of jobs) {
    const resvg = new Resvg(job.svg, {
      fitTo: { mode: 'width', value: job.width },
      background: '#000000',
      shapeRendering: 2, // geometricPrecision
      imageRendering: 1,
    });
    const rendered = resvg.render();
    const { pixels, width, height } = rendered;
    const gray = Buffer.allocUnsafe(width * height);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = pixels[i];
    fs.writeFileSync(job.out, gray);
    out.push({ out: job.out, width, height });
  }
  process.stdout.write(JSON.stringify({ results: out }));
}

main().catch((e) => {
  process.stderr.write(String((e && e.stack) || e));
  process.exit(1);
});
