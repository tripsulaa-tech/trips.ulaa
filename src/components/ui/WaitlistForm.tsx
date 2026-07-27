import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Clock3, User, Users } from 'lucide-react';
import type { WaitlistFormData } from '../../types/types-index';
import { submitWaitlist } from '../../services/api';
import Button from './Button';

// Mirrors BookingForm's MIN/MAX_GROUP_SIZE — a group waitlist signup is
// still "how many seats does this group need", same bounds apply.
const MIN_GROUP_SIZE = 2;
const MAX_GROUP_SIZE = 15;

interface WaitlistFormProps {
  tripId: string;
  tripTitle?: string;
  onSuccess?: () => void;
  // Preselects Group mode and seeds the seat count — used when someone
  // arrives here because their group didn't fit in the seats remaining
  // (BookingForm's "join the waitlist for your group" case), so they don't
  // have to re-declare Solo vs Group from scratch.
  defaultMode?: 'solo' | 'group';
  defaultGroupSize?: number;
}

type FormValues = Omit<WaitlistFormData, 'trip_id' | 'trip_title' | 'group_size'>;

export default function WaitlistForm({ tripId, tripTitle, onSuccess, defaultMode = 'solo', defaultGroupSize }: WaitlistFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [mode, setMode] = useState<'solo' | 'group'>(defaultMode);
  const [groupSize, setGroupSize] = useState(
    Math.min(Math.max(defaultGroupSize ?? MIN_GROUP_SIZE, MIN_GROUP_SIZE), MAX_GROUP_SIZE)
  );

  // Keep in sync if the caller opens this same mounted form for a
  // different context (e.g. re-triggered with a new group size).
  useEffect(() => { setMode(defaultMode); }, [defaultMode]);
  useEffect(() => {
    if (defaultGroupSize !== undefined) {
      setGroupSize(Math.min(Math.max(defaultGroupSize, MIN_GROUP_SIZE), MAX_GROUP_SIZE));
    }
  }, [defaultGroupSize]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>();

  const onSubmit = async (data: FormValues) => {
    try {
      setStatus('loading');
      await submitWaitlist({
        ...data,
        trip_id: tripId,
        trip_title: tripTitle,
        group_size: mode === 'group' ? groupSize : null,
      });
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
          {mode === 'group'
            ? `We'll message and email you the moment ${groupSize} seats free up together on this trip.`
            : "We'll message and email you the moment a seat frees up on this trip."}
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
            {mode === 'group' ? (
              <>
                Not enough seats left to book your group on{' '}
                <span className="font-semibold text-dark">{tripTitle}</span> right now. Join the
                waitlist and we'll notify you the moment enough seats open up together — no
                payment needed.
              </>
            ) : (
              <>
                This trip is fully booked. Join the waitlist for{' '}
                <span className="font-semibold text-dark">{tripTitle}</span> and we'll notify you
                the moment a seat opens up — no payment needed.
              </>
            )}
          </p>
        </div>
      )}

      {/* Solo vs Group */}
      <div>
        <label className="block text-sm font-medium text-dark mb-1">Waiting For</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('solo')}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 font-medium text-sm transition-colors ${
              mode === 'solo'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-background-warm text-dark-muted hover:border-primary/40'
            }`}
          >
            <User size={16} /> Solo
          </button>
          <button
            type="button"
            onClick={() => setMode('group')}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 font-medium text-sm transition-colors ${
              mode === 'group'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-background-warm text-dark-muted hover:border-primary/40'
            }`}
          >
            <Users size={16} /> Group
          </button>
        </div>
      </div>

      {mode === 'group' && (
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Number of People *</label>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_GROUP_SIZE}
            max={MAX_GROUP_SIZE}
            value={groupSize}
            onChange={e => {
              const val = e.target.value === '' ? MIN_GROUP_SIZE : Math.round(Number(e.target.value));
              setGroupSize(Math.min(Math.max(val, MIN_GROUP_SIZE), MAX_GROUP_SIZE));
            }}
            className={inputClass}
          />
          <p className="text-xs text-dark-muted mt-1">
            We'll only mark you ready to convert once at least {groupSize} seats are free together
            — not the moment a single seat opens up.
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
