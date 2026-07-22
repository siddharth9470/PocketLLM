import { Dimensions, PixelRatio } from "react-native";

/**
 * Density-independent scaling helpers.
 *
 * Sizes are authored against a 375pt reference width (standard phone) and scaled
 * uniformly by the device's shortest side, capped so tablets/large phones do not
 * inflate the UI. Font sizes additionally honor the user's system font-scale
 * accessibility preference via {@link PixelRatio.getFontScale}.
 */

const GUIDELINE_BASE_WIDTH = 375;
const MAX_LAYOUT_SCALE = 1.3;
const MAX_FONT_SCALE = 1.35;

const { width, height } = Dimensions.get("window");
const shortestSide = Math.min(width, height) || GUIDELINE_BASE_WIDTH;
const uniformScale = Math.min(shortestSide / GUIDELINE_BASE_WIDTH, MAX_LAYOUT_SCALE);

/** Scales layout dimensions (padding, margins, radii, icons) uniformly across breakpoints. */
export function scaleSize(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * uniformScale));
}

/** Scales font sizes uniformly while respecting the system font-scale preference. */
export function scaleFont(size: number): number {
  const fontScale = Math.min(PixelRatio.getFontScale(), MAX_FONT_SCALE);
  return Math.round(PixelRatio.roundToNearestPixel(size * uniformScale * fontScale));
}
