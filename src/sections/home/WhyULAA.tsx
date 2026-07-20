import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SectionTitle from '../../components/ui/SectionTitle';
import { getSiteContent } from '../../services/api';
import { DEFAULT_WHY_ULAA } from '../../constants/why-ulaa';
import type { WhyUlaaContent } from '../../types';

export default function WhyULAA() {
  const [content, setContent] = useState<WhyUlaaContent>(DEFAULT_WHY_ULAA);

  useEffect(() => {
    getSiteContent<WhyUlaaContent>('why_ulaa')
      .then(data => { if (data) setContent(data); })
      .catch(() => {});
  }, []);

  const { features } = content;

  return (
    <section className="relative isolate py-14 sm:py-24 px-4 sm:px-6 lg:px-8 bg-cream">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 sm:mb-16 flex justify-center">
          <SectionTitle
            label="Why Choose Us"
            title="Travel differently."
            subtitle="ULAA isn't just a travel company. We're a sisterhood of fearless explorers who believe every woman deserves to see the world safely."
            align="center"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 md:gap-8">
          {features.map(({ image, title, description }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="relative aspect-[4/3] rounded-2xl sm:rounded-3xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 group"
            >
              <img
                src={image}
                alt={title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/0" />
              <div className="relative h-full flex flex-col justify-end p-3 sm:p-4">
                <h3 className="font-display text-sm sm:text-base font-bold text-white mb-1">{title}</h3>
                <p className="text-white/85 text-xs leading-snug">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}