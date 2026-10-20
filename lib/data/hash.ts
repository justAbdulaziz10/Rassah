import { createHash } from "node:crypto";

/** Fingerprint of a product page's text. If it changes, cached AI facts are stale. */
export function computeSourceHash(name: string, description: string): string {
  return createHash("sha256").update(`${name}\n${description}`, "utf8").digest("hex");
}
