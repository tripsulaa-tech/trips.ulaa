import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Layout from '../components/layout/Layout';
import SectionTitle from '../components/ui/SectionTitle';
import { Heart } from 'lucide-react';
import { getSiteContent } from '../services/api';
import { DEFAULT_ABOUT, ABOUT_VALUE_ICONS } from '../constants/about';
import type { AboutContent } from '../types';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&q=80';

export default function AboutPage() {
  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);

  useEffect(() => {
    getSiteContent<AboutContent>('about')
      .then(data => { if (data) setContent(data); })
      .catch(() => {});
  }, []);

  const { hero, mission, vision, philosophy, values, timeline } = content;

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-96 md:h-[500px] overflow-hidden">
        <img src={HERO_IMAGE} alt="About ULAA" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/50 to-dark/85" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-secondary text-sm font-button font-semibold tracking-[0.2em] uppercase">{hero.label}</span>
            <h1 className="font-display text-4xl md:text-6xl font-bold mt-3">{hero.title}</h1>
            <p className="text-white/80 mt-3 text-lg max-w-xl">
              {hero.subtitle}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Mission & Vision */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <img
              src="https://images.unsplash.com/photo-1502781252888-9143ba7f074e?w=800&q=80"
              alt="Women traveling"
              className="rounded-3xl shadow-warm-lg w-full h-80 md:h-96 object-cover"
            />
          </motion.div>
          <div className="space-y-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-primary text-sm font-button font-semibold tracking-widest uppercase">{mission.label}</span>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-dark mt-2 mb-4">
                {mission.title}
              </h2>
              <p className="text-dark-muted leading-relaxed">
                {mission.text}
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
              <span className="text-primary text-sm font-button font-semibold tracking-widest uppercase">{vision.label}</span>
              <h2 className="font-display text-3xl font-bold text-dark mt-2 mb-4">
                {vision.title}
              </h2>
              <p className="text-dark-muted leading-relaxed">
                {vision.text}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-dark">
        <div className="max-w-5xl mx-auto text-center text-white">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="text-secondary text-sm font-button font-semibold tracking-widest uppercase">{philosophy.label}</span>
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mt-4 mb-8 leading-tight">
              {philosophy.quote_line1}
              <br />
              <span className="text-secondary italic">"{philosophy.quote_line2}"</span>
            </h2>
            <p className="text-white/70 text-lg leading-relaxed max-w-3xl mx-auto">
              {philosophy.text}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="relative isolate py-24 px-4 sm:px-6 lg:px-8 bg-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <SectionTitle
              label="What We Stand For"
              title="Our values."
              subtitle="The principles that guide every trip, every decision, every adventure."
              align="center"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map(({ icon, title, description }, i) => {
              const Icon = ABOUT_VALUE_ICONS[icon] || Heart;
              return (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white rounded-3xl p-8 shadow-card flex gap-6"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon size={26} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold text-dark mb-2">{title}</h3>
                    <p className="text-dark-muted text-sm leading-relaxed">{description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <SectionTitle
              label="Our Journey"
              title="How ULAA was born."
              align="center"
            />
          </div>
          <div className="relative">
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-background-warm md:-translate-x-1/2" />
            <div className="space-y-12">
              {timeline.map((item, i) => (
                <motion.div
                  key={`${item.year}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`relative flex items-start gap-6 md:gap-0 ${
                    i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                  }`}
                >
                  {/* Content */}
                  <div className={`pl-16 md:pl-0 md:w-5/12 ${i % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12 md:text-left'}`}>
                    <span className="text-primary font-button font-bold text-lg">{item.year}</span>
                    <h3 className="font-display text-xl font-bold text-dark mt-1 mb-2">{item.title}</h3>
                    <p className="text-dark-muted text-sm leading-relaxed">{item.description}</p>
                  </div>
                  {/* Dot */}
                  <div className="absolute left-6 md:left-1/2 md:-translate-x-1/2 w-5 h-5 rounded-full bg-primary border-4 border-white shadow-warm shrink-0" />
                  <div className="hidden md:block md:w-5/12" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
