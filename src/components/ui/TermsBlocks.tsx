import type { TermsBlock } from '../../utils/parseTerms';

interface TermsBlocksProps {
  blocks: TermsBlock[];
}

// Renders the structured blocks produced by parseTerms(): plain paragraphs,
// bolded sub-headings (e.g. "Domestic Trips"), and bullet lists.
export default function TermsBlocks({ blocks }: TermsBlocksProps) {
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'paragraph') {
          return (
            <p key={i} className="text-sm text-dark-muted leading-relaxed">
              {block.text}
            </p>
          );
        }
        if (block.type === 'subheading') {
          return (
            <p key={i} className="text-xs font-semibold text-dark uppercase tracking-wide pt-1">
              {block.text}
            </p>
          );
        }
        return (
          <ul key={i} className="space-y-1.5">
            {block.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2 text-sm text-dark-muted leading-relaxed">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
