export async function retained(page) {
  return page.evaluate(async () => {
    const state = globalThis.__eraserCheckpointProbe;
    const started = performance.now();
    await Promise.all(state.jobs);
    const nodes = [...document.querySelectorAll('svg')];
    if (nodes.length > state.diagnosticLimits.svgs)
      state.diagnosticErrors.push('Document SVG inventory limit');
    const svgClassifications = nodes.map((node) => ({
      classification: state.classifications.get(node) ?? null,
      geometry: state.geometry(node),
    }));
    const metadataJsonCharacters = JSON.stringify({
      details: state.details,
      svgErrors: state.svgErrors,
      svgClassifications,
    }).length;
    if (state.causal && metadataJsonCharacters > 1024 * 1024)
      state.diagnosticErrors.push('Metadata retention byte limit');
    const retention = {
      serializedCharacters: state.serialized.reduce((sum, item) => sum + item.text.length, 0),
      base64Characters: state.retained.reduce((sum, item) => sum + item.length, 0),
      metadataJsonCharacters,
      hashCost: state.hashCost,
      hashSettlementMs: performance.now() - started,
      retainedSvgCount: state.serialized.length,
      retainedPngCount: state.retained.length,
      callbackBase64Characters: state.callbackPngs.reduce(
        (sum, item) => sum + item.base64.length,
        0
      ),
      diagnosticLimits: state.diagnosticLimits,
      hashJobs: state.jobs.length,
      heap: state.heap(),
    };
    return {
      captures: state.captures,
      retained: state.retained,
      callbackPngs: state.callbackPngs,
      events: state.events,
      maxMaskDepth: state.maxMaskDepth,
      maxImages: state.maxImages,
      details: state.details,
      diagnosticErrors: state.diagnosticErrors,
      svgErrors: state.svgErrors,
      svgClassifications,
      serialized: state.serialized,
      retention,
    };
  });
}
