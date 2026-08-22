// Stand-in for the `html2canvas` package.
//
// Nothing in this app imports html2canvas directly — both PDF utilities
// (src/utils/tripItineraryPdf.ts, src/utils/invoicePdf.ts) draw PDFs with
// jsPDF's own vector text/shape primitives instead of rasterizing HTML
// (see the comment at the top of invoicePdf.ts for why that approach was
// chosen over html2canvas).
//
// jsPDF still ships an optional `doc.html()` convenience API that
// dynamically `import()`s html2canvas internally, purely on the chance a
// caller uses it. Since we never call `.html()`, that import is dead code
// — but Rollup can't prove that statically (it's a runtime dynamic
// import inside a third-party dependency), so without this alias the
// real ~200KB html2canvas library still got bundled as its own
// never-fetched chunk. This file is aliased in place of it (see
// vite.config.ts) so nothing is bundled at all.
//
// If `.html()` is ever actually needed, this throws immediately with a
// clear message instead of silently misbehaving — install html2canvas
// for real and remove the alias.
export default function html2canvas(): never {
  throw new Error(
    "html2canvas is stubbed out of this build (see src/stubs/html2canvas-stub.ts). " +
      "This app draws PDFs directly with jsPDF primitives and doesn't use jsPDF's " +
      "doc.html() API — if you need it, install html2canvas and remove the alias " +
      "in vite.config.ts."
  );
}
