import { motion } from 'framer-motion';
import SectionTitle from '../../components/ui/SectionTitle';
import TravelDoodles from '../../components/ui/TravelDoodles';
import FlightPath from '../../components/ui/FlightPath';
import { homeGalleryDoodles } from '../../components/ui/doodlePresets';

// TODO: swap these placeholder images for real ULAA trip photos when ready.
const features = [
  {
    image: 'https://picsum.photos/seed/ulaa-girls-only/600/800',
    title: 'Girls Only',
    description: 'Safe, comfortable, and empowering spaces designed exclusively for women travelers.',
  },
  {
    image: 'https://picsum.photos/seed/ulaa-verified-organizers/600/800',
    title: 'Verified Organizers',
    description: 'Every trip is planned and escorted by experienced, verified female trip leaders.',
  },
  {
    image: 'https://picsum.photos/seed/ulaa-safe-travel/600/800',
    title: 'Safe Travel',
    description: 'Your safety is our priority. Trusted accommodations, vetted partners, 24/7 support.',
  },
  {
    image: 'https://picsum.photos/seed/ulaa-hidden-destinations/600/800',
    title: 'Hidden Destinations',
    description: 'Discover places off the tourist trail — untouched, authentic, and breathtaking.',
  },
  {
    image: 'https://picsum.photos/seed/ulaa-small-groups/600/800',
    title: 'Small Groups',
    description: 'Intimate group sizes of 8–15 travelers ensure deeper connections and real experiences.',
  },
  {
    image: 'https://picsum.photos/seed/ulaa-local-experiences/600/800',
    title: 'Local Experiences',
    description: 'Support local communities, eat local food, and live like a local at every destination.',
  },
];

export default function WhyULAA() {
  return (
    <section className="relative isolate py-14 sm:py-24 px-4 sm:px-6 lg:px-8 bg-cream">
      <TravelDoodles items={homeGalleryDoodles} />
      <FlightPath className="top-4 right-[-3%] w-[260px] sm:w-[340px] text-primary/25" />
      <FlightPath className="bottom-0 left-[-4%] w-[220px] sm:w-[300px] text-secondary/25" flip />
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
              className="relative aspect-[3/4] sm:aspect-[4/5] rounded-2xl sm:rounded-3xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 group"
            >
              <img
                src={image}
                alt={title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/0" />
              <div className="relative h-full flex flex-col justify-end p-4 sm:p-7">
                <h3 className="font-display text-sm sm:text-xl font-bold text-white mb-1.5 sm:mb-2">{title}</h3>
                <p className="text-white/85 text-xs sm:text-sm leading-relaxed">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}