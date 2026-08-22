// -----------------------------------------------------------------------
// Shared image-loading helpers for PDF generation (invoicePdf.ts,
// tripItineraryPdf.ts). All are best-effort and never throw — a slow
// network, a CORS-restricted host, or a missing image should never break
// PDF generation; callers just quietly skip that photo/logo.
// -----------------------------------------------------------------------

/** Fetches a URL and resolves it to a base64 data URL, or null on any
 *  failure (network error, non-2xx response, unreadable blob). */
export async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Decodes an image src (data URL or regular URL) into an HTMLImageElement,
 *  so callers can read its natural dimensions. */
export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = src;
  });
}

/** Loads an image and returns it plus its natural aspect ratio (width /
 *  height), so callers can fit it into a bounding box without distortion.
 *  Returns null on any failure. */
export async function loadContainImage(url: string): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const dataUrl = await fetchAsDataUrl(url);
    if (!dataUrl) return null;
    const img = await loadImageEl(dataUrl);
    return { dataUrl, ratio: img.naturalWidth / img.naturalHeight };
  } catch {
    return null;
  }
}
