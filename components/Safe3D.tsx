"use client";

import { Component, useSyncExternalStore, type ReactNode } from "react";

// Some browsers have WebGL turned off or blocked (no GPU, hardware acceleration off,
// privacy settings). The 3D canvas then throws, and without a guard the whole page
// falls through to app/error.tsx. Safe3D shows `fallback` instead.

let webglSupport: boolean | undefined;

function detectWebGL(): boolean {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webglSupport = gl !== null;
    // Free the probe context; browsers cap how many can be alive at once.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const noSubscribe = () => () => {};

class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("3D view unavailable, showing the 2D view instead.", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Safe3D({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  // The server can't know; assume yes so the 3D loading placeholder renders, then re-check on the client.
  const supported = useSyncExternalStore(noSubscribe, detectWebGL, () => true);
  if (!supported) return fallback;
  return <CanvasBoundary fallback={fallback}>{children}</CanvasBoundary>;
}
