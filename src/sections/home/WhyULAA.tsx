import { motion } from 'framer-motion';
import { Shield, Users, MapPin, Heart, Compass, Leaf } from 'lucide-react';
import SectionTitle from '../../components/ui/SectionTitle';

const features = [
  {
    icon: Heart,
    title: 'Girls Only',
    description: 'Safe, comfortable, and empowering spaces designed exclusively for women travelers.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Shield,
    title: 'Verified Organizers',
    description: 'Every trip is planned and escorted by experienced, verified female trip leaders.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Compass,
    title: 'Safe Travel',
    description: 'Your safety is our priority. Trusted accommodations, vetted partners, 24/7 support.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: MapPin,
    title: 'Hidden Destinations',
    description: 'Discover places off the tourist trail — untouched, authentic, and breathtaking.',
    color: 'bg-green-50 text-green-600',
  },
  {
    icon: Users,
    title: 'Small Groups',
    description: 'Intimate group sizes of 8–15 travelers ensure deeper connections and real experiences.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Leaf,
    title: 'Local Experiences',
    description: 'Support local communities, eat local food, and live like a local at every destination.',
    color: 'bg-teal-50 text-teal-600',
  },
];

export default function WhyULAA() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-cream">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16 flex justify-center">
          <SectionTitle
            label="Why Choose Us"
            title="Travel differently."
            subtitle="ULAA isn't just a travel company. We're a sisterhood of fearless explorers who believe every woman deserves to see the world safely."
            align="center"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {features.map(({ icon: Icon, title, description, color }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="bg-white rounded-3xl p-8 shadow-card hover:shadow-card-hover transition-all duration-300 group"
            >
              <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110`}>
                <Icon size={26} strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-xl font-bold text-dark mb-3">{title}</h3>
              <p className="text-dark-muted text-sm leading-relaxed">{description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
