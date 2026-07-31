import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import type { Testimonial } from '../../types/types-index';
import { PLACEHOLDER_IMAGE } from '../../utils/utils-index';

interface TestimonialCardProps {
  testimonial: Testimonial;
  index?: number;
}

// Reviews longer than this are truncated behind a "Read more" toggle so
// cards stay a consistent, scannable height in the grid.
const TRUNCATE_LENGTH = 180;

export default function TestimonialCard({ testimonial, index = 0 }: TestimonialCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = testimonial.review.length > TRUNCATE_LENGTH;
  const displayedReview =
    isLong && !expanded
      ? `${testimonial.review.slice(0, TRUNCATE_LENGTH).trimEnd()}…`
      : testimonial.review;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="bg-white rounded-xl p-8 shadow-card hover:shadow-card-hover transition-all duration-300 border border-background-warm"
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
      <blockquote className="text-dark-muted text-base leading-relaxed mb-2 italic font-display">
        "{displayedReview}"
      </blockquote>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-primary text-sm font-semibold hover:text-primary-dark transition-colors mb-4"
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
      {!isLong && <div className="mb-6" />}

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
