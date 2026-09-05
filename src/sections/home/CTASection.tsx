import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { getSiteContent } from '../../services/api';
import { DEFAULT_CTA_BANNER, mergeWithDefaults } from '../../constants/cta-banner';
import type { CtaBannerContent } from '../../types/types-index';

export default function CTASection() {
  const [content, setContent] = useState<CtaBannerContent>(DEFAULT_CTA_BANNER);

  useEffect(() => {
    getSiteContent<Partial<CtaBannerContent>>('cta_banner')
      .then(data => { if (data) setContent(mergeWithDefaults(data)); })
      .catch(() => {});
  }, []);

  const { image, eyebrow, heading_line1, heading_highlight, subheading, primary_label, secondary_label } = content;

  return (
    <section className="relative py-20 sm:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={image} alt="Adventure awaits" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark/90 via-dark/70 to-dark/50" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center text-white">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 sm:space-y-6"
        >
          <span className="inline-flex items-center gap-3 text-secondary font-script font-medium text-2xl sm:text-3xl md:text-4xl">
            {eyebrow}
          </span>

          <h2 className="font-display text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
            {heading_line1}
            <br />
            <span className="text-secondary italic">{heading_highlight}</span>
          </h2>

          <p className="text-white/80 text-base sm:text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
            {subheading}
          </p>

          <div className="flex flex-row gap-3 sm:gap-4 justify-center pt-4">
            <Link to="/trips">
              <Button variant="primary" size="sm" className="group/btn sm:px-8 sm:py-4 sm:text-base">
                {primary_label}
                <ArrowRight size={18} className="transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button
                variant="ghost"
                size="sm"
                className="text-white border-white/40 hover:border-white hover:bg-white/10 sm:px-8 sm:py-4 sm:text-base"
              >
                {secondary_label}
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
