import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Clock3 } from 'lucide-react';
import type { WaitlistFormData } from '../../types';
import { submitWaitlist } from '../../services/api';
import Button from './Button';

interface WaitlistFormProps {
  tripId: string;
  tripTitle?: string;
  onSuccess?: () => void;
}

type FormValues = Omit<WaitlistFormData, 'trip_id' | 'trip_title'>;

export default function WaitlistForm({ tripId, tripTitle, onSuccess }: WaitlistFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>();

  const onSubmit = async (data: FormValues) => {
    try {
      setStatus('loading');
      await submitWaitlist({ ...data, trip_id: tripId, trip_title: tripTitle });
      setStatus('success');
      reset();
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      if (err instanceof Error && err.message === 'DUPLICATE_WAITLIST_ENTRY') {
        setErrorMsg("You're already on the waitlist for this trip — we'll reach out the moment a seat opens up.");
      } else {
        setErrorMsg('Something went wrong. Please try again or contact us on WhatsApp.');
      }
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
        <h3 className="font-display text-2xl font-bold text-dark mb-2">You're on the list!</h3>
        <p className="text-dark-muted">
          We'll message and email you the moment a seat frees up on this trip.
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {tripTitle && (
        <div className="bg-background-warm rounded-xl px-4 py-3 mb-2 flex items-start gap-2.5">
          <Clock3 size={16} className="text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-dark-muted">
            This trip is fully booked. Join the waitlist for{' '}
            <span className="font-semibold text-dark">{tripTitle}</span> and we'll notify you the
            moment a seat opens up — no payment needed.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Full Name */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-dark mb-1">Full Name *</label>
          <input
            {...register('full_name', { required: 'Full name is required' })}
            placeholder="Your full name"
            autoComplete="name"
            className={inputClass}
          />
          {errors.full_name && <p className={errorClass}>{errors.full_name.message}</p>}
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
            autoComplete="tel"
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
            autoComplete="email"
            className={inputClass}
          />
          {errors.email && <p className={errorClass}>{errors.email.message}</p>}
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="block text-sm font-medium text-dark mb-1">Message (Optional)</label>
        <textarea
          {...register('message')}
          rows={2}
          placeholder="e.g. flexible on dates, travelling with a friend..."
          className={`${inputClass} resize-none`}
        />
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
        Join Waitlist
      </Button>

      <p className="text-xs text-dark-muted text-center">
        No payment required. We'll reach out as soon as a spot opens up.
      </p>
    </form>
  );
}
