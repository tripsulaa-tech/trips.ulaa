import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import heroImg from '../../assets/hero.png';

export default function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const textVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.15, duration: 0.7, ease: 'easeOut' as const },
    }),
  };

  return (
    <section
      ref={containerRef}
      className="relative min-h-[60vh] sm:min-h-[82vh] lg:min-h-[85vh]"
    >
      {/* Parallax Background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div className="absolute inset-0" style={{ y }}>
          <img
            src={heroImg}
            alt="ULAA — Girls-only travel experiences"
            className="w-full h-full object-cover"
            fetchPriority="high"
          />
        </motion.div>

        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-dark/60 via-dark/40 to-dark/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark/40 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <motion.div
        style={{ opacity }}
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 lg:pt-36 pb-12 text-white"
      >
        <div className="max-w-3xl">
          {/* Headline */}
          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={textVariants}
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.15] mb-6"
          >
            Girls-only
            <br />
            <span className="text-secondary italic">travel</span> experiences.
          </motion.h1>

          {/* Subheading */}
          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={textVariants}
            className="text-base sm:text-lg text-white/85 leading-relaxed mb-3 sm:mb-8 max-w-xl"
          >
            Discover hidden destinations. Travel safely.
            Create unforgettable memories with like-minded women.
          </motion.p>

          {/* Buttons */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={textVariants}
            className="flex flex-row flex-wrap gap-3 sm:gap-4"
          >
            <Link to="/trips">
              <Button
                variant="primary"
                size="sm"
                className="group/btn whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-xl"
              >
                Explore Trips
                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1 sm:w-[18px] sm:h-[18px]" />
              </Button>
            </Link>
            <Link to="/completed-trips">
              <Button
                variant="ghost"
                size="sm"
                className="whitespace-nowrap text-white border-white/40 hover:border-white hover:bg-white/10 sm:px-8 sm:py-4 sm:text-lg sm:rounded-xl"
              >
                <Play size={14} className="fill-white sm:w-4 sm:h-4" />
                View Gallery
              </Button>
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, repeat: Infinity, repeatType: 'reverse', duration: 1 }}
        className="hidden sm:flex absolute bottom-24 left-1/2 -translate-x-1/2 flex-col items-center gap-2 text-white/60"
      >
        <span className="text-xs font-button tracking-widest uppercase">Scroll</span>
        <div className="w-px h-10 bg-gradient-to-b from-white/60 to-transparent" />
      </motion.div>
    </section>
  );
}
