export function parseModelId(id: string): { author: string; name: string } {
  const slashIndex = id.indexOf("/");
  if (slashIndex === -1) {
    return { author: "unknown", name: id };
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

export function formatParameterBillions(billions: number): string {
  if (billions >= 10) {
    return `${Math.round(billions)}B`;
  }
  return `${billions.toFixed(1)}B`;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}
