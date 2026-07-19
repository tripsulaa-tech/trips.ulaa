import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Play, Users, ShieldCheck, MapPin, Leaf } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import heroImg from '../../assets/hero.png';

const stats = [
  { icon: Users, title: 'Girls Only', subtitle: 'Safe & Comfortable' },
  { icon: ShieldCheck, title: 'Verified Organizers', subtitle: 'Trusted & Experienced' },
  { icon: MapPin, title: 'Hidden Destinations', subtitle: 'Unseen. Local. Authentic.' },
  { icon: Users, title: 'Small Groups', subtitle: 'Bond. Connect. Explore.' },
  { icon: Leaf, title: 'Local Experiences', subtitle: 'Taste. Culture. People.' },
];

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
      className="relative min-h-[78vh] sm:min-h-[82vh] lg:min-h-[85vh]"
    >
      {/* Parallax Background - clipped in its own layer so it doesn't cut off the floating stats card below */}
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
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 lg:pt-32 pb-12 text-white"
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
            className="text-base sm:text-lg text-white/85 leading-relaxed mb-8 max-w-xl"
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
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link to="/trips">
              <Button variant="primary" size="lg" className="group/btn">
                Explore Trips
                <ArrowRight size={18} className="transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </Link>
            <Link to="/completed-trips">
              <Button
                variant="ghost"
                size="lg"
                className="text-white border-white/40 hover:border-white hover:bg-white/10"
              >
                <Play size={16} className="fill-white" />
                View Gallery
              </Button>
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* Floating stats strip — aligned with the page container (Explore Trips to Book Now width) */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.6, ease: 'easeOut' }}
        className="absolute left-0 right-0 bottom-0 translate-y-1/2 z-30 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-[1216px] mx-auto bg-white rounded-xl shadow-card-hover p-[18px]">
          <div className="flex gap-6 overflow-x-auto sm:overflow-visible sm:grid sm:grid-cols-5 sm:gap-0 sm:divide-x sm:divide-background-warm scrollbar-hide">
            {stats.map(({ icon: Icon, title, subtitle }) => (
              <div
                key={title}
                className="flex items-center gap-3 shrink-0 sm:shrink sm:justify-self-start min-w-[210px] sm:min-w-0 sm:px-4 first:sm:pl-0"
              >
                <div className="w-10 h-10 rounded-lg bg-background-warm text-primary flex items-center justify-center shrink-0">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-display font-bold text-dark text-sm sm:text-[15px] leading-tight">
                    {title}
                  </p>
                  <p className="text-dark-muted text-xs leading-tight mt-0.5">{subtitle}</p>
                </div>
              </div>
            ))}
          </div>
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