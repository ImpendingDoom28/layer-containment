// Software (CPU) rasterizers can't run a fullscreen bloom pass at usable
// framerates — under headless/CI SwiftShader a single bloom drops the scene
// from ~11 to ~6 fps and starves the main thread (Playwright e2e times out).
// Detecting the rasterizer lets us keep bloom for real GPUs while auto-disabling
// it wherever the WebGL context is software-emulated.

const SOFTWARE_RENDERER_MARKERS = [
  "swiftshader",
  "llvmpipe",
  "softpipe",
  "software",
];

let cached: boolean | null = null;

export const isSoftwareRenderer = (): boolean => {
  if (cached !== null) return cached;
  if (typeof window === "undefined" || !document?.createElement) {
    cached = false;
    return cached;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") || canvas.getContext("webgl") || null;
    if (!gl) {
      cached = false;
      return cached;
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : "";
    cached = SOFTWARE_RENDERER_MARKERS.some((marker) =>
      renderer.toLowerCase().includes(marker)
    );
  } catch {
    cached = false;
  }
  return cached;
};
