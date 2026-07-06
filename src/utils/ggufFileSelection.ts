import type { HFSibling } from "../types/models";

const NON_LANGUAGE_GGUF_PATTERNS = [
  /mmproj/i,
  /multimodal/i,
  /vision/i,
  /\bclip\b/i,
  /encoder/i,
  /projector/i,
  /\bvae\b/i,
  /image/i,
  /audio/i,
  /whisper/i,
  /embed/i,
];

function basename(path: string): string {
  const normalized = path.replace(/^file:\/\//, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? path;
}

export function isLanguageModelGgufFilename(filename: string): boolean {
  const lower = basename(filename).toLowerCase();
  if (!lower.endsWith(".gguf")) {
    return false;
  }

  return !NON_LANGUAGE_GGUF_PATTERNS.some((pattern) => pattern.test(lower));
}

function scoreLanguageModelGguf(filename: string): number {
  const lower = basename(filename).toLowerCase();
  let score = 0;

  if (/q[0-9]/i.test(lower)) {
    score += 20;
  }

  if (/k_m|k_s|iq/i.test(lower)) {
    score += 5;
  }

  if (/f16|f32|bf16/i.test(lower)) {
    score -= 3;
  }

  if (/split/i.test(lower)) {
    score -= 25;
  }

  if (/test|dummy|sample/i.test(lower)) {
    score -= 50;
  }

  return score;
}

export function selectLanguageModelGguf(siblings: HFSibling[]): HFSibling | undefined {
  const candidates = siblings.filter((sibling) => isLanguageModelGgufFilename(sibling.rfilename));
  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort(
    (left, right) => scoreLanguageModelGguf(right.rfilename) - scoreLanguageModelGguf(left.rfilename),
  )[0];
}

export function getLanguageModelGgufFilename(siblings: HFSibling[]): string | null {
  const selected = selectLanguageModelGguf(siblings);
  if (!selected) {
    return null;
  }

  return selected.rfilename.split("/").pop() ?? selected.rfilename;
}
