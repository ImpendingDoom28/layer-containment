// Configs are plain static JSON served next to the app shell, so a
// root-absolute fetch works from the dev server, any static sub-path, and
// the packaged desktop app (which serves the built files from a local loopback
// http origin — see electron/main.ts).
export const loadFile = async (path: string) => {
  try {
    const response = await fetch(`${path}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load file: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(
      `Failed to load file: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
};
