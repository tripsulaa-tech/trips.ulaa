// Paints a generated PDF onto <canvas> elements, one per page.
//
// Why not an <iframe src="blob:…">: phone browsers (Android Chrome, iOS
// Safari) can't display PDFs inline, and the site's Content-Security-Policy
// blocks blob: frames — either way the preview showed "This content is
// blocked". Drawing the pages ourselves works the same everywhere.
import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Raw PDF bytes (from invoiceGeneratorPdfBytes). */
  data: ArrayBuffer;
  /** Called if the PDF could not be drawn. */
  onError?: () => void;
}

export default function InvoicePdfPreview({ data, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Track the available width so the pages are drawn sharp at any screen size.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || width === 0) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        // pdf.js takes ownership of the buffer it is given, so hand it a copy.
        const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false, useSystemFonts: true });
        const pdf = await task.promise;
        cleanup = () => { void task.destroy(); };
        if (cancelled) { void task.destroy(); return; }

        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const canvases: HTMLCanvasElement[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.background = '#fff';
          if (n > 1) canvas.style.marginTop = '8px';
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas is not supported in this browser.');
          await page.render({ canvasContext: ctx, viewport }).promise;
          canvases.push(canvas);
        }
        if (cancelled) return;
        // Swap all pages in at once so the preview never flashes empty.
        host.replaceChildren(...canvases);
      } catch (err) {
        console.error('Failed to draw invoice preview', err);
        if (!cancelled) onError?.();
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [data, width, onError]);

  return <div ref={hostRef} className="w-full h-full overflow-y-auto" role="img" aria-label="Invoice preview" />;
}
