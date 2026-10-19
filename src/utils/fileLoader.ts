export const loadFile = async (path: string) => {
  try {
    // Callers pass a root-absolute path (e.g. "/configs/game"). For file://
    // (packaged Electron) an absolute URL would resolve against the
    // filesystem root, so strip the leading slash and resolve relative to
    // the document directory instead. Over http this is equivalent to the
    // original root-absolute fetch.
    const relativePath = path.replace(/^\/+/, "");
    const url = new URL(`${relativePath}.json`, document.baseURI).href;
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
