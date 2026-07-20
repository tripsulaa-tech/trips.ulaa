import { motion } from 'framer-motion';

interface SectionTitleProps {
  label?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
  light?: boolean;
}

export default function SectionTitle({
  label,
  title,
  subtitle,
  align = 'center',
  light = false,
}: SectionTitleProps) {
  const alignClass = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  }[align];

  return (
    <div className={`flex flex-col gap-3 ${alignClass}`}>
      {label && (
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className={`
            inline-flex items-center gap-2 text-sm font-button font-semibold
            tracking-[0.2em] uppercase
            ${light ? 'text-secondary' : 'text-primary'}
          `}
        >
          <span className={`w-6 h-px ${light ? 'bg-secondary' : 'bg-primary'}`} />
          {label}
          <span className={`w-6 h-px ${light ? 'bg-secondary' : 'bg-primary'}`} />
        </motion.span>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className={`
          font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight
          ${light ? 'text-white' : 'text-dark'}
        `}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className={`
            text-base sm:text-lg md:text-xl max-w-2xl leading-relaxed
            ${light ? 'text-white/80' : 'text-dark-muted'}
          `}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
