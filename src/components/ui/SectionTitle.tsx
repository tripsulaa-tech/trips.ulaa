import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

type Align = 'left' | 'center' | 'right';
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

interface SectionTitleProps {
  /**
   * 'script' (default) — the big animated hero-ish treatment used on the
   * homepage sections: a large cursive `label`, a big display `title`, and
   * an optional `subtitle`. Unchanged from the original component.
   *
   * 'plain' — a compact, non-animated section heading used for in-page
   * section headers (trip detail, album, contact). With no `label`/`rule`
   * it's just a bare heading; passing `label` adds a small uppercase
   * eyebrow above the title, and `rule` adds a short accent bar next to it
   * — covering what used to be three separate hand-rolled treatments.
   */
  variant?: 'script' | 'plain';
  /** Heading element to render. Defaults to 'h2'. */
  as?: HeadingTag;
  /** Optional icon rendered inline before the title (plain variant only). */
  icon?: ReactNode;
  /**
   * script: large font-script label above the title.
   * plain: small uppercase eyebrow label above the title.
   */
  label?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: Align;
  /** Use light (white) text for dark/photo backgrounds. */
  light?: boolean;
  /** plain variant only: title size. Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** plain variant only: show a short accent bar next to the title. */
  rule?: boolean;
  /** plain variant only: where the accent bar sits relative to the title. Defaults to 'after'. */
  rulePosition?: 'before' | 'after';
  /** Whether to fade/slide the title in on mount. Defaults to true for 'script', false for 'plain'. */
  animate?: boolean;
  /** Extra classes appended to the wrapping element. */
  className?: string;
  /** Extra classes appended to the heading element (e.g. one-off spacing). */
  titleClassName?: string;
}

const ALIGN_CLASSES: Record<Align, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
};

const PLAIN_SIZE_CLASSES: Record<NonNullable<SectionTitleProps['size']>, string> = {
  sm: 'text-xl sm:text-2xl',
  md: 'text-2xl sm:text-3xl',
  lg: 'text-3xl sm:text-[2rem]',
  xl: 'text-3xl sm:text-4xl',
};

function RuleBar({ className = '' }: { className?: string }) {
  return <span className={`block w-12 h-[3px] rounded-full bg-primary ${className}`} aria-hidden="true" />;
}

export default function SectionTitle({
  variant = 'script',
  as,
  icon,
  label,
  title,
  subtitle,
  align = 'center',
  light = false,
  size = 'md',
  rule = false,
  rulePosition = 'after',
  animate,
  className = '',
  titleClassName = '',
}: SectionTitleProps) {
  const alignClass = ALIGN_CLASSES[align];

  if (variant === 'plain') {
    const Tag = as ?? 'h2';
    const shouldAnimate = animate ?? false;
    const titleNode = (
      <Tag
        className={`font-display font-bold leading-tight ${PLAIN_SIZE_CLASSES[size]} ${light ? 'text-white' : 'text-dark'} ${
          icon ? 'inline-flex items-center gap-2' : ''
        } ${titleClassName}`}
      >
        {icon}
        {title}
      </Tag>
    );

    return (
      <div className={`flex flex-col ${alignClass} ${className}`}>
        {rule && rulePosition === 'before' && <RuleBar className={label ? 'mb-3' : 'mb-4'} />}
        {label && (
          <p
            className={`font-button text-[11px] font-semibold uppercase tracking-[0.25em] ${
              light ? 'text-white/80' : 'text-primary'
            }`}
          >
            {label}
          </p>
        )}
        {shouldAnimate ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={label ? 'mt-3' : ''}
          >
            {titleNode}
          </motion.div>
        ) : (
          <div className={label ? 'mt-3' : ''}>{titleNode}</div>
        )}
        {rule && rulePosition === 'after' && <RuleBar className="mt-4" />}
        {subtitle && (
          <p className={`${light ? 'text-white/80' : 'text-dark-muted'} mt-2 leading-relaxed`}>
            {subtitle}
          </p>
        )}
      </div>
    );
  }

  // 'script' variant — original behavior, preserved exactly.
  const shouldAnimate = animate ?? true;
  const Label = label && (
    <span
      className={`
        font-script font-normal text-3xl md:text-4xl
        ${light ? 'text-secondary' : 'text-primary'}
      `}
    >
      {label}
    </span>
  );
  const Title = (
    <h2
      className={`
        font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight
        ${light ? 'text-white' : 'text-dark'} ${titleClassName}
      `}
    >
      {title}
    </h2>
  );
  const Subtitle = subtitle && (
    <p
      className={`
        text-base sm:text-lg md:text-xl max-w-2xl leading-relaxed
        ${light ? 'text-white/80' : 'text-dark-muted'}
      `}
    >
      {subtitle}
    </p>
  );

  return (
    <div className={`flex flex-col gap-3 ${alignClass} ${className}`}>
      {label && (
        shouldAnimate ? (
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {Label}
          </motion.span>
        ) : Label
      )}
      {shouldAnimate ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.25 }}>
          {Title}
        </motion.div>
      ) : Title}
      {subtitle && (
        shouldAnimate ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.25 }}>
            {Subtitle}
          </motion.div>
        ) : Subtitle
      )}
    </div>
  );
}
