// The packaged Electron app loads the built files from file://; the browser
// always uses http(s). Shared by the router (hash vs. path routes) and the
// config loader (asset resolution).
export const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";
