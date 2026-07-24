import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, FileText } from 'lucide-react';
import type { BookingFormData } from '../../types';
import { submitEnquiry } from '../../services/api';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { parseTerms } from '../../utils/parseTerms';
import Button from './Button';
import Modal from './Modal';
import TermsBlocks from './TermsBlocks';

interface BookingFormProps {
  tripId?: string;
  tripTitle?: string;
  terms?: string;
  onSuccess?: () => void;
}

export default function BookingForm({ tripId, tripTitle, terms, onSuccess }: BookingFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);

  const termsText = (terms || '').trim() || DEFAULT_TERMS_AND_CONDITIONS;
  const termsSections = useMemo(() => parseTerms(termsText), [termsText]);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<BookingFormData>();

  const onSubmit = async (data: BookingFormData) => {
    try {
      setStatus('loading');
      await submitEnquiry({ ...data, trip_id: tripId, trip_title: tripTitle });
      setStatus('success');
      reset();
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg('Something went wrong. Please try again or contact us on WhatsApp.');
    }
  };

  if (status === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-12"
      >
        <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
        <h3 className="font-display text-2xl font-bold text-dark mb-2">Enquiry Received!</h3>
        <p className="text-dark-muted">
          Thank you! We'll contact you shortly to confirm your spot.
        </p>
      </motion.div>
    );
  }

  const inputClass = `
    w-full px-4 py-3 rounded-xl border-2 bg-background
    font-body text-dark placeholder-dark-muted/50
    transition-all duration-200 outline-none
    focus:border-primary focus:bg-white
    border-background-warm
  `;

  const errorClass = 'text-red-500 text-xs mt-1';

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {tripTitle && (
        <div className="bg-background-warm rounded-xl px-4 py-3 mb-2">
          <p className="text-sm text-dark-muted">
            Booking for: <span className="font-semibold text-dark">{tripTitle}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Full Name *</label>
          <input
            {...register('full_name', { required: 'Full name is required' })}
            placeholder="Your full name"
            className={inputClass}
          />
          {errors.full_name && <p className={errorClass}>{errors.full_name.message}</p>}
        </div>

        {/* Age */}
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Age *</label>
          <input
            type="number"
            {...register('age', {
              required: 'Age is required',
              min: { value: 18, message: 'Must be 18 or older' },
              max: { value: 65, message: 'Age must be under 65' },
            })}
            placeholder="Your age"
            className={inputClass}
          />
          {errors.age && <p className={errorClass}>{errors.age.message}</p>}
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Phone Number *</label>
          <input
            type="tel"
            {...register('phone', {
              required: 'Phone number is required',
              pattern: { value: /^[+\d\s\-()]{8,15}$/, message: 'Invalid phone number' },
            })}
            placeholder="+91 63813 36772"
            className={inputClass}
          />
          {errors.phone && <p className={errorClass}>{errors.phone.message}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Email *</label>
          <input
            type="email"
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email address' },
            })}
            placeholder="you@example.com"
            className={inputClass}
          />
          {errors.email && <p className={errorClass}>{errors.email.message}</p>}
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-dark mb-1">City</label>
          <input
            {...register('city')}
            placeholder="Your city"
            className={inputClass}
          />
        </div>

        {/* Emergency Contact */}
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Emergency Contact</label>
          <input
            type="tel"
            {...register('emergency_contact')}
            placeholder="Emergency contact number"
            className={inputClass}
          />
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="block text-sm font-medium text-dark mb-1">Message (Optional)</label>
        <textarea
          {...register('message')}
          rows={3}
          placeholder="Any questions or special requirements..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Terms & Conditions */}
      <div className="bg-background-warm rounded-xl p-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            {...register('terms_accepted', { required: 'You must agree to the Terms & Conditions to continue' })}
            className="w-4 h-4 mt-0.5 accent-primary shrink-0"
          />
          <span className="text-sm text-dark">
            I have read and agree to the{' '}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="text-primary font-medium hover:underline"
            >
              Terms & Conditions
            </button>
          </span>
        </label>
        {errors.terms_accepted && <p className={errorClass}>{errors.terms_accepted.message}</p>}
      </div>

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl p-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={status === 'loading'}
        className="mt-2"
      >
        Submit Enquiry
      </Button>

      <p className="text-xs text-dark-muted text-center">
        No payment required. We'll contact you to confirm your spot.
      </p>
    </form>

    <Modal isOpen={termsOpen} onClose={() => setTermsOpen(false)} title="Terms & Conditions" size="xl">
      <div className="flex items-start gap-2 -mt-1 mb-4 text-dark-muted">
        <FileText size={16} className="shrink-0 mt-0.5 text-primary" />
        <p className="text-xs leading-relaxed">
          Please read the full policy below before confirming your booking. Tap a number to jump to that section.
        </p>
      </div>

      {/* Quick-jump section chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-3 mb-3 border-b border-background-warm">
        {termsSections.map(section => (
          <button
            key={section.number}
            type="button"
            onClick={() => sectionRefs.current[section.number]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            title={section.title}
            className="shrink-0 text-xs font-semibold w-7 h-7 rounded-full bg-background-warm text-dark-muted hover:bg-primary hover:text-white transition-colors flex items-center justify-center"
          >
            {section.number}
          </button>
        ))}
      </div>

      <div className="relative">
        <div className="max-h-[50vh] overflow-y-auto app-scroll pr-2 space-y-5 scroll-smooth">
          {termsSections.length > 0 ? termsSections.map(section => (
            <div
              key={section.number}
              ref={el => { sectionRefs.current[section.number] = el; }}
              className="scroll-mt-1"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {section.number}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-dark mb-1.5">{section.title}</h4>
                  <TermsBlocks blocks={section.blocks} />
                </div>
              </div>
              {section.number !== termsSections[termsSections.length - 1].number && (
                <div className="h-px bg-background-warm mt-5 ml-10" />
              )}
            </div>
          )) : (
            <p className="text-sm text-dark whitespace-pre-line">{termsText}</p>
          )}
        </div>
        {/* Fade hint so it's clear the panel scrolls */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-background-warm">
        <Button variant="primary" size="md" onClick={() => setTermsOpen(false)}>Close</Button>
      </div>
    </Modal>
    </>
  );
}
