export type TermsBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'bullets'; items: string[] };

export interface TermsSection {
  number: string;
  title: string;
  blocks: TermsBlock[];
}

// Turns the raw "N. Title\n...body..." terms text into structured sections so
// it can be rendered with real headings, sub-headings, and bullet lists
// instead of one long wall of plain text.
//
// Sub-headings (e.g. "Domestic Trips") are often followed immediately by a
// bullet list with no blank line in between, so a block boundary is also
// drawn whenever a line switches between "bullet" and "non-bullet" — not
// just on blank lines. Without this, a sub-heading line gets swallowed into
// the same paragraph as the bullets that follow it.
export function parseTerms(raw: string): TermsSection[] {
  const headerRe = /^(\d+)\.\s+(.*)$/;
  const rawSections: { number: string; title: string; lines: string[] }[] = [];

  for (const line of raw.split('\n')) {
    const match = line.match(headerRe);
    if (match) {
      rawSections.push({ number: match[1], title: match[2].trim(), lines: [] });
    } else if (rawSections.length > 0) {
      rawSections[rawSections.length - 1].lines.push(line);
    }
  }

  return rawSections.map(({ number, title, lines }) => {
    const blocks: TermsBlock[] = [];
    let buffer: string[] = [];
    let bufferIsBullet: boolean | null = null;

    const flush = () => {
      if (buffer.length === 0) return;
      const isBulletBlock = buffer.every(l => /^-\s+/.test(l.trim()));
      if (isBulletBlock) {
        blocks.push({ type: 'bullets', items: buffer.map(l => l.trim().replace(/^-\s+/, '')) });
      } else if (buffer.length === 1 && buffer[0].trim().length <= 40 && !buffer[0].trim().endsWith('.')) {
        blocks.push({ type: 'subheading', text: buffer[0].trim() });
      } else {
        blocks.push({ type: 'paragraph', text: buffer.join(' ').trim() });
      }
      buffer = [];
      bufferIsBullet = null;
    };

    for (const line of lines) {
      if (line.trim() === '') {
        flush();
        continue;
      }
      const isBulletLine = /^-\s+/.test(line.trim());
      if (bufferIsBullet !== null && isBulletLine !== bufferIsBullet) {
        flush();
      }
      buffer.push(line);
      bufferIsBullet = isBulletLine;
    }
    flush();

    return { number, title, blocks };
  });
}
