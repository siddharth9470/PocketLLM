const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const formattedValue = value >= 100 || exponent === 0 ? value.toFixed(0) : value.toFixed(1);

  return `${formattedValue} ${SIZE_UNITS[exponent]}`;
}
