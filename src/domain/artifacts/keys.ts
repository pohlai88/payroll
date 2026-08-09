/**
 * @feature artifacts
 * @layer domain
 *
 * Artifact object-key + filename normalisation.
 * Keys always use `/`; never trust caller paths into LocalFs/R2.
 */

const FILENAME_MAX = 180;
const UNSAFE_FILENAME = /[^a-zA-Z0-9._-]+/g;
const HAS_ALNUM = /[a-zA-Z0-9]/;
const WINDOWS_DRIVE = /^[a-zA-Z]:/;
/** Global flag is safe here: only ever used with `replace`, which resets lastIndex. */
const BACKSLASH = /\\/g;

/** Strip path separators and odd chars so a filename is a single key segment. */
export function sanitizeArtifactFilename(
  filename: string,
  fallback = "artifact.bin"
): string {
  const safe = filename.replace(UNSAFE_FILENAME, "_").slice(0, FILENAME_MAX);
  if (safe.length === 0 || !HAS_ALNUM.test(safe)) {
    return fallback;
  }
  return safe;
}

/**
 * Normalise to forward-slash key segments and reject traversal / absolute forms.
 * Returns the normalised key (never absolute, never empty segments).
 */
export function assertSafeArtifactKey(key: string): string {
  const normalized = key.replace(BACKSLASH, "/");
  if (normalized.length === 0) {
    throw new Error("refusing empty artifact key");
  }
  if (
    normalized.startsWith("/") ||
    WINDOWS_DRIVE.test(normalized) ||
    normalized.includes("\0")
  ) {
    throw new Error(`refusing unsafe artifact key: ${key}`);
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw new Error(`refusing unsafe artifact key: ${key}`);
  }
  return normalized;
}

export function filenameFromArtifactKey(relativePath: string): string {
  const normalized = relativePath.replace(BACKSLASH, "/");
  const base = normalized.split("/").pop();
  return base !== undefined && base.length > 0 ? base : normalized;
}
