// The packaged Electron app loads the built files from file://, where a
// root-absolute URL ("configs/game.json" -> "/configs/game.json") would
// resolve against the filesystem root and fetch of a sibling file is CORS
// blocked. In that case resolve relative to the document directory instead.
// Over http (dev server or a sub-path host) keep the original root-absolute
// fetch, which works from the root and from any sub-path.
const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";

export const loadFile = async (path: string) => {
  try {
    const url = isFileProtocol
      ? new URL(`${path.replace(/^\/+/, "")}.json`, document.baseURI).href
      : `${path}.json`;
    const response = await fetch(url);
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
