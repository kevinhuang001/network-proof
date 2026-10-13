/**
 * A deterministic scan plan for Android still photographs.
 *
 * The overview can shrink a small code below the camera's effective module pitch.
 * Finder-pattern detection is an optimization only; these five overlapping crops
 * allow decoding with more original pixels even when the finder is not detected.
 * Pure geometry is tested independently of camera hardware and WebView behavior.
 */
export interface PhotoRegion {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function planPhotoRegions(image: { width: number; height: number }): PhotoRegion[] {
  const { width, height } = image;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32) return [];
  const w = Math.max(32, Math.ceil(width * 0.7));
  const h = Math.max(32, Math.ceil(height * 0.7));
  const lastX = width - w;
  const lastY = height - h;
  const locations = [
    ['中央', Math.floor(lastX / 2), Math.floor(lastY / 2)],
    ['左上', 0, 0],
    ['右上', lastX, 0],
    ['左下', 0, lastY],
    ['右下', lastX, lastY],
  ] as const;
  const seen = new Set<string>();
  const regions: PhotoRegion[] = [];
  for (const [label, left, top] of locations) {
    const key = `${left},${top},${w},${h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    regions.push({ name: `分区（${label}）`, left, top, width: w, height: h });
  }
  return regions;
}
