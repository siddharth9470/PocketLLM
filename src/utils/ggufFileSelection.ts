import type { GgufVariant, HFSibling } from "@/types/models";

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

export function listLanguageModelGgufVariants(siblings: HFSibling[]): GgufVariant[] {
  return siblings
    .filter((sibling) => isLanguageModelGgufFilename(sibling.rfilename))
    .map((sibling) => ({
      filename: sibling.rfilename.split("/").pop() ?? sibling.rfilename,
      sizeBytes: sibling.size ?? null,
    }))
    .sort((left, right) => (left.sizeBytes ?? 0) - (right.sizeBytes ?? 0));
}

function countLanguageModelGgufFiles(siblings: HFSibling[]): number {
  let count = 0;
  for (const sibling of siblings) {
    if (isLanguageModelGgufFilename(sibling.rfilename)) {
      count += 1;
    }
  }
  return count;
}

export function resolveGgufFileSizeBytes(siblings: HFSibling[], totalFileSize?: number | null): number | null {
  if (totalFileSize == null || totalFileSize <= 0) {
    return null;
  }

  // totalFileSize is only reliable when the repo exposes a single language-model GGUF.
  return countLanguageModelGgufFiles(siblings) === 1 ? totalFileSize : null;
}

const MODEL_SIZE_PATTERN = /(?:^|[-_.])(?:(\d+(?:\.\d+)?)[bB]|E(\d+)[bB]|A(\d+)[bB])(?![a-z])/i;

function extractParameterBillionsFromLabel(label: string): number | null {
  const standardSizes: number[] = [];
  const efficientSizes: number[] = [];
  const activeSizes: number[] = [];

  const pattern = new RegExp(MODEL_SIZE_PATTERN.source, "gi");
  for (const match of label.matchAll(pattern)) {
    if (match[1]) {
      standardSizes.push(Number.parseFloat(match[1]));
      continue;
    }
    if (match[2]) {
      efficientSizes.push(Number.parseFloat(match[2]));
      continue;
    }
    if (match[3]) {
      activeSizes.push(Number.parseFloat(match[3]));
    }
  }

  if (standardSizes.length > 0) {
    return standardSizes[0];
  }
  if (efficientSizes.length > 0) {
    return efficientSizes[0];
  }
  if (activeSizes.length > 0) {
    return activeSizes[0];
  }

  return null;
}

export function resolveParameterBillions(labels: string[], ggufTotalParams?: number | null): number | null {
  for (const label of labels) {
    const fromLabel = extractParameterBillionsFromLabel(label);
    if (fromLabel != null) {
      return fromLabel;
    }
  }

  if (ggufTotalParams != null) {
    return ggufTotalParams / 1e9;
  }

  return null;
}
