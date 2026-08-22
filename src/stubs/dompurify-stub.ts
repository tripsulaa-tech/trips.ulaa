// Stand-in for the `dompurify` package.
//
// Same situation as src/stubs/html2canvas-stub.ts: nothing in this app
// imports dompurify directly. jsPDF's optional `doc.html()` API
// dynamically imports it internally (to sanitize HTML strings before
// rasterizing them), but we never call `.html()`, so it was dead code
// pulled into the build as its own never-fetched ~29KB chunk. Aliased in
// place of the real package (see vite.config.ts) so nothing is bundled.
//
// If `.html()` is ever actually needed, this throws immediately instead
// of silently misbehaving — install dompurify for real and remove the
// alias.
const dompurify = {
  sanitize(): never {
    throw new Error(
      "dompurify is stubbed out of this build (see src/stubs/dompurify-stub.ts). " +
        "This app draws PDFs directly with jsPDF primitives and doesn't use jsPDF's " +
        "doc.html() API — if you need it, install dompurify and remove the alias " +
        "in vite.config.ts."
    );
  },
};

export default dompurify;
