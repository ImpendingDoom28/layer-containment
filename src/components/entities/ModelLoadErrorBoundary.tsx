import { Component, type ReactNode } from "react";

type ModelLoadErrorBoundaryProps = {
  /** Rendered instead of `children` once a child render throws. */
  fallback: ReactNode;
  children: ReactNode;
};

/**
 * Catches renders that throw during a model load (network error, 404, parse
 * error): `useGLTF` throws while its request is settling, and with no boundary
 * that would unmount the whole scene rather than the single object being
 * loaded. `Suspense` alone only covers the *pending* load, so this pairs with
 * it (see `ModelLoader` and `PlanetTileDecorations`), degrading the affected
 * object to its fallback.
 */
export class ModelLoadErrorBoundary extends Component<
  ModelLoadErrorBoundaryProps,
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
