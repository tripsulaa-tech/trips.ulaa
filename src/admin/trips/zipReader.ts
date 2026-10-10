// Minimal zip reader for the trip Import flow, so an admin can hand over ONE .zip holding the
// filled-in template JSON plus the photos it names. Uses the browser's built-in
// DecompressionStream, so no extra package is needed. Supports "stored" and "deflate" entries,
// which is what Windows, macOS and every common zip tool produce. (Zip64 / encrypted zips are
// not supported.)

export interface ZipEntry {
  name: string;
  getBlob: () => Promise<Blob>;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  json: 'application/json',
};

export const mimeForName = (name: string): string =>
  MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(file: File): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // End-of-central-directory record: scan backwards (it can be followed by a zip comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid zip file');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // Skip folders, macOS resource-fork clutter and hidden files.
    const base = name.split('/').pop() ?? '';
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || base.startsWith('.')) continue;
    if (flags & 1) throw new Error('Password-protected zips are not supported');

    entries.push({
      name,
      getBlob: async () => {
        const nl = view.getUint16(localOffset + 26, true);
        const el = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + nl + el;
        const raw = buf.subarray(start, start + compSize);
        if (method === 0) return new Blob([raw as BlobPart], { type: mimeForName(name) });
        if (method === 8) return new Blob([(await inflateRaw(raw)) as BlobPart], { type: mimeForName(name) });
        throw new Error(`Unsupported zip compression (${method})`);
      },
    });
  }
  return entries;
}
