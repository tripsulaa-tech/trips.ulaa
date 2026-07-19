import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle } from 'lucide-react';
import type { BookingFormData } from '../../types';
import { submitEnquiry } from '../../services/api';
import Button from './Button';

interface BookingFormProps {
  tripId?: string;
  tripTitle?: string;
  onSuccess?: () => void;
}

export default function BookingForm({ tripId, tripTitle, onSuccess }: BookingFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

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
            placeholder="+91 98765 43210"
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
  );
}
