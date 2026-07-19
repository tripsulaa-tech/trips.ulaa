import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';

const CTA_IMAGE = 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1400&q=80';

export default function CTASection() {
  return (
    <section className="relative py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={CTA_IMAGE} alt="Adventure awaits" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark/90 via-dark/70 to-dark/50" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center text-white">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <span className="inline-flex items-center gap-2 text-secondary text-sm font-button font-semibold tracking-[0.2em] uppercase">
            <span className="w-6 h-px bg-secondary" />
            Your Adventure Awaits
            <span className="w-6 h-px bg-secondary" />
          </span>

          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
            Ready for your
            <br />
            <span className="text-secondary italic">next adventure?</span>
          </h2>

          <p className="text-white/80 text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
            Book your seat today. No payment needed — just your passion to explore.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link to="/trips">
              <Button variant="primary" size="xl" className="group/btn">
                Book Your Seat
                <ArrowRight size={20} className="transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button
                variant="ghost"
                size="xl"
                className="text-white border-white/40 hover:border-white hover:bg-white/10"
              >
                Talk to Us
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
