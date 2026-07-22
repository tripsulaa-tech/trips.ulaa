import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import type { Testimonial } from '../../types';
import { PLACEHOLDER_IMAGE } from '../../utils';

interface TestimonialCardProps {
  testimonial: Testimonial;
  index?: number;
}

export default function TestimonialCard({ testimonial, index = 0 }: TestimonialCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="bg-white rounded-3xl p-8 shadow-card hover:shadow-card-hover transition-all duration-300 border border-background-warm"
    >
      {/* Stars */}
      <div className="flex gap-1 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={16}
            className={i < testimonial.rating ? 'text-secondary fill-secondary' : 'text-gray-200 fill-gray-200'}
          />
        ))}
      </div>

      {/* Review */}
      <blockquote className="text-dark-muted text-base leading-relaxed mb-6 italic font-display">
        "{testimonial.review}"
      </blockquote>

      {/* Author */}
      <div className="flex items-center gap-4">
        <img
          src={testimonial.photo || PLACEHOLDER_IMAGE}
          alt={testimonial.name}
          className="w-12 h-12 rounded-full object-cover border-2 border-background-warm"
        />
        <div>
          <p className="font-semibold text-dark">{testimonial.name}</p>
          {testimonial.destination && (
            <p className="text-sm text-primary">{testimonial.destination}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
