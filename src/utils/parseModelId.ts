export function parseModelId(id: string): { author: string; name: string } {
  const slashIndex = id.indexOf('/');
  if (slashIndex === -1) {
    return { author: 'unknown', name: id };
  }

  return {
    author: id.slice(0, slashIndex),
    name: id.slice(slashIndex + 1),
  };
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}
