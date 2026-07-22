const GEMMA4_THOUGHT_BLOCK = /<\|channel>(?:thought|analysis|commentary|reasoning)[\s\S]*?<channel\|>/gi;

const XML_THOUGHT_TO_FINAL_BLOCK =
  /<channel>(?:thought|analysis|commentary|reasoning)<\/channel>[\s\S]*?(?=<channel>(?:final|answer|response)<\/channel>)/gi;

const XML_FINAL_CHANNEL_MARKER = /<channel>(?:final|answer|response)<\/channel>\s*/gi;

const XML_THOUGHT_CHANNEL_TAG = /<channel>(?:thought|analysis|commentary|reasoning)<\/channel>\s*/gi;

const XML_REASONING_TAGS = /<(think|thinking|reasoning|analysis)>[\s\S]*?<\/\1>/gi;

const ORPHAN_CHANNEL_MARKERS = /<\|channel>(?:thought|analysis|commentary|reasoning)\s*|<channel\|>|<\|channel>/gi;

const REASONING_PATTERNS: RegExp[] = [
  GEMMA4_THOUGHT_BLOCK,
  XML_THOUGHT_TO_FINAL_BLOCK,
  XML_FINAL_CHANNEL_MARKER,
  XML_THOUGHT_CHANNEL_TAG,
  XML_REASONING_TAGS,
  ORPHAN_CHANNEL_MARKERS,
];

function applyReasoningPatterns(text: string): string {
  let result = text;
  let previous = "";

  while (result !== previous) {
    previous = result;

    for (const pattern of REASONING_PATTERNS) {
      result = result.replace(pattern, "");
    }
  }

  return result;
}

export function stripReasoningTags(raw: string): string {
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/\r\n/g, "\n");
  const stripped = applyReasoningPatterns(normalized);

  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizeAssistantResponse(raw: string, parsedContent?: string): string {
  const parsed = parsedContent?.trim() ?? "";
  const source = parsed.length > 0 ? parsed : raw;
  return stripReasoningTags(source);
}

const INCOMPLETE_GEMMA4_THOUGHT = /<\|channel>(?:thought|analysis|commentary|reasoning)[\s\S]*$/i;

const INCOMPLETE_XML_THOUGHT_TO_FINAL =
  /<channel>(?:thought|analysis|commentary|reasoning)<\/channel>[\s\S]*?(?=<channel>(?:final|answer|response)<\/channel>|$)/i;

const TRAILING_CHANNEL_MARKER = /<\|channel>(?:thought|analysis|commentary|reasoning)?\s*$/i;

export function stripReasoningTagsForStreaming(raw: string): string {
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/\r\n/g, "\n");
  let result = applyReasoningPatterns(normalized);

  if (INCOMPLETE_XML_THOUGHT_TO_FINAL.test(result)) {
    result = result.replace(INCOMPLETE_XML_THOUGHT_TO_FINAL, "");
  }

  result = result.replace(INCOMPLETE_GEMMA4_THOUGHT, "");
  result = result.replace(TRAILING_CHANNEL_MARKER, "");

  return result.replace(/\n{3,}/g, "\n\n").trimEnd();
}
