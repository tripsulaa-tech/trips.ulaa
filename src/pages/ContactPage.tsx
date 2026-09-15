import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import {
  Envelope,
  EnvelopeSimple,
  InstagramLogo as Instagram,
  MapPin,
  CheckCircle,
  WarningCircle as AlertCircle,
  PaperPlaneTilt as Send,
  ArrowRight,
  User,
  Phone,
  ChatCircleDots,
  LockSimple,
  Leaf,
  Heart,
  MapTrifold,
  UsersThree,
  Star,
  TreePalm,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon';
import { submitContactEnquiry } from '../services/api';
import { getWhatsAppLink } from '../utils/utils-index';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { usePageMeta } from '../hooks/usePageMeta';
import { validateEmail, validateFullName, validateOptionalPhone } from '../utils/formValidation';
import { fadeUp } from '../utils/animation';
import contactImg from '../assets/hero.webp';

interface ContactForm {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

const WHATSAPP_NUMBER = '916381336772';
const EMAIL = 'trips.ulaa@gmail.com';
const INSTAGRAM_URL = 'https://www.instagram.com/ulaa.trips?igsh=MXhpbHdwOXhmamZsZw==';
const MESSAGE_SOFT_LIMIT = 500;

// Three reassurance chips under the hero copy.
const HERO_CHIPS = [
  { Icon: Leaf, label: 'Real People' },
  { Icon: Heart, label: 'Quick Responses' },
  { Icon: MapTrifold, label: 'Personalized Plans' },
] as const;

// "Why Travel with ULAA?" strip at the foot of the page. Each tile gets its
// own pastel circle rather than the page's single brand orange, so the four
// read as a set of distinct promises instead of one repeated badge.
const WHY_ULAA = [
  {
    Icon: UsersThree,
    title: 'Women-First Community',
    description: 'A safe, supportive space for women travelers.',
    circle: 'bg-green-50 text-green-600',
  },
  {
    Icon: Leaf,
    title: 'Authentic Experiences',
    description: 'Hidden gems, local stories and real connections.',
    circle: 'bg-orange-50 text-primary',
  },
  {
    Icon: Heart,
    title: 'Trip Assistance',
    description: "From planning to packing, we're with you.",
    circle: 'bg-pink-50 text-pink-500',
  },
  {
    Icon: Star,
    title: 'Thoughtfully Curated',
    description: 'Small groups, big memories.',
    circle: 'bg-blue-50 text-blue-500',
  },
] as const;

// Shared input chrome for the message form. The leading icon sits inside the
// field (absolutely positioned), so every control reserves the same `pl-11`
// gutter whether or not it currently shows an error.
const fieldClass = (hasError: boolean) => `
  block w-full rounded-xl border bg-white pl-11 pr-4 py-3.5 font-body text-dark text-[15px]
  placeholder-dark-muted/50 outline-none transition-colors duration-200
  ${hasError ? 'border-red-300 focus:border-red-400' : 'border-background-warm focus:border-primary'}
`;

const iconClass = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dark-muted/50';

export default function ContactPage() {
  // Remember and restore scroll position when leaving/returning via the
  // bottom nav, same as the trips pages. The form is static, so there's no
  // async load to wait on before restoring.
  useScrollRestoration('/contact', true);

  usePageMeta({
    title: 'Contact Us | ULAA Trips',
    description: "Got questions, custom plans, or just want to say hi? Reach the ULAA team on WhatsApp, email or Instagram.",
    path: '/contact',
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm<ContactForm>();

  const messageLength = watch('message', '')?.length ?? 0;

  const onSubmit = async (data: ContactForm) => {
    try {
      setStatus('loading');
      await submitContactEnquiry({
        full_name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
      });
      setStatus('success');
      reset();
    } catch (err) {
      setStatus('error');
      if (err instanceof Error && err.message === 'DUPLICATE_ENQUIRY') {
        setErrorMsg("Looks like you've already sent this exact message — we've got it and will get back to you shortly.");
      } else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    }
  };

  return (
    <Layout>
      {/* ---------------------------------------------------------------
          Hero — warm cream band, editorial headline on the left and a
          blob-masked photo collage on the right (script note, rotating
          "explore more together" seal, torn sticky note).
         --------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background-warm via-background to-cream px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="max-w-[1344px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 items-center">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="font-button text-primary text-[11px] sm:text-xs font-semibold uppercase tracking-[0.3em]">
                Let's stay connected
              </p>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-dark leading-[1.1] mt-4">
                Let's plan your<br className="hidden sm:block" /> next adventure{' '}
                <span className="font-script font-normal text-primary text-5xl sm:text-6xl lg:text-[4rem] leading-none inline-block -rotate-3 ml-1">
                  together.
                </span>
              </h1>

              <p className="text-dark-muted mt-5 max-w-md leading-relaxed">
                Got questions, custom plans, or just want to say hi?
                We're all ears — drop us a message and we'll get back to you soon.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
                {HERO_CHIPS.map(({ Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-dark-muted text-sm">
                    <Icon size={20} className="text-dark/70 shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Photo collage */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative h-[300px] sm:h-[380px] lg:h-[420px]"
              aria-hidden="true"
            >
              {/* The organic mask is declared once here and referenced by the
                  photo's clip-path — an SVG clipPath keeps the wavy silhouette
                  identical at every width, which nested border-radius tricks
                  can't do. */}
              <svg width="0" height="0" className="absolute" aria-hidden="true">
                <defs>
                  <clipPath id="ulaa-contact-blob" clipPathUnits="objectBoundingBox">
                    <path d="M0.055,0.30 C0.095,0.10 0.28,0.015 0.42,0.075 C0.52,0.12 0.60,0.055 0.72,0.045 C0.885,0.03 1,0.14 0.99,0.335 C0.98,0.515 0.94,0.655 0.95,0.80 C0.96,0.93 0.86,1 0.70,0.99 C0.50,0.975 0.30,1 0.18,0.955 C0.04,0.905 0,0.735 0.02,0.555 C0.03,0.44 0.03,0.40 0.055,0.30 Z" />
                  </clipPath>
                </defs>
              </svg>

              <div className="absolute inset-y-0 right-0 left-[18%] sm:left-[22%]">
                <img
                  src={contactImg}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ clipPath: 'url(#ulaa-contact-blob)' }}
                  loading="eager"
                  fetchPriority="high"
                />
              </div>

              {/* Handwritten note, left of the photo */}
              <p className="absolute left-0 top-[14%] font-script text-dark text-xl sm:text-2xl leading-[1.5] -rotate-6">
                Good<br />Trips<br />Brighter<br />People ♥
              </p>

              {/* Rotating seal */}
              <motion.div
                className="absolute -top-2 right-0 sm:right-2 w-24 h-24 sm:w-28 sm:h-28"
                animate={{ rotate: 360 }}
                transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <defs>
                    <path
                      id="ulaa-seal-circle"
                      d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0"
                      fill="none"
                    />
                  </defs>
                  <text className="fill-dark" style={{ fontSize: '11px', letterSpacing: '3.4px', fontWeight: 500 }}>
                    <textPath href="#ulaa-seal-circle" startOffset="0%">
                      EXPLORE MORE · TOGETHER ·
                    </textPath>
                  </text>
                </svg>
                <span className="absolute inset-0 flex items-center justify-center">
                  <TreePalm size={22} className="text-dark" />
                </span>
              </motion.div>

              {/* Torn sticky note */}
              <div className="absolute bottom-[6%] right-[2%] sm:right-[4%] rotate-[4deg] bg-white shadow-card px-5 py-4 [clip-path:polygon(0%_6%,100%_0%,97%_100%,3%_94%)]">
                <p className="font-script text-dark text-lg sm:text-xl leading-[1.45]">
                  Travel<br />Ask<br />Plan<br />Repeat ♥
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Channels + message form
         --------------------------------------------------------------- */}
      <section className="relative isolate bg-white px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="max-w-[1344px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12">
            {/* Channels */}
            <motion.div {...fadeUp()}>
              <h2 className="font-display text-3xl sm:text-[2rem] font-bold text-dark">Reach us your way</h2>
              <p className="text-dark-muted mt-2 leading-relaxed">
                Choose the channel you're most comfortable with.<br className="hidden sm:block" />
                We're always happy to help!
              </p>

              <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* WhatsApp */}
                <a
                  href={getWhatsAppLink(WHATSAPP_NUMBER)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col rounded-2xl border border-background-warm bg-white p-5 shadow-card hover:shadow-card-hover transition-shadow"
                >
                  <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#25D366] to-[#128C4A] flex items-center justify-center">
                    <WhatsAppIcon className="w-5 h-5 text-white" />
                  </span>
                  <p className="font-display font-bold text-dark mt-4">WhatsApp (Fastest)</p>
                  <p className="text-dark-muted text-sm mt-1">Chat with us directly</p>
                  <span className="mt-4 flex items-end justify-between gap-2">
                    <span className="font-semibold text-dark text-sm break-all">+91 63813 36772</span>
                    <ArrowRight size={18} className="shrink-0 text-dark-muted group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </span>
                </a>

                {/* Email */}
                <a
                  href={`mailto:${EMAIL}`}
                  className="group flex flex-col rounded-2xl border border-background-warm bg-white p-5 shadow-card hover:shadow-card-hover transition-shadow"
                >
                  <span className="w-11 h-11 rounded-xl bg-orange-50 text-primary flex items-center justify-center">
                    <Envelope size={22} />
                  </span>
                  <p className="font-display font-bold text-dark mt-4">Email Us</p>
                  <p className="text-dark-muted text-sm mt-1">Write to us anytime</p>
                  <span className="mt-4 flex items-end justify-between gap-2">
                    <span className="font-semibold text-dark text-sm break-all group-hover:text-primary transition-colors">{EMAIL}</span>
                    <ArrowRight size={18} className="shrink-0 text-dark-muted group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </span>
                </a>

                {/* Instagram */}
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col rounded-2xl border border-background-warm bg-white p-5 shadow-card hover:shadow-card-hover transition-shadow"
                >
                  <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F9CE34] via-[#EE2A7B] to-[#6228D7] flex items-center justify-center">
                    <Instagram size={22} className="text-white" />
                  </span>
                  <p className="font-display font-bold text-dark mt-4">Follow on Instagram</p>
                  <p className="text-dark-muted text-sm mt-1">Travel updates & stories</p>
                  <span className="mt-4 flex items-end justify-between gap-2">
                    <span className="font-semibold text-dark text-sm group-hover:text-primary transition-colors">@ulaa.trips</span>
                    <ArrowRight size={18} className="shrink-0 text-dark-muted group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </span>
                </a>

                {/* Based in India — informational, so it's a div, not a link */}
                <div className="flex flex-col rounded-2xl border border-background-warm bg-white p-5 shadow-card">
                  <span className="w-11 h-11 rounded-xl bg-orange-50 text-primary flex items-center justify-center">
                    <MapPin size={22} />
                  </span>
                  <p className="font-display font-bold text-dark mt-4">Based in India</p>
                  <p className="text-dark-muted text-sm mt-1">Exploring everywhere 🇮🇳</p>
                  <span className="mt-4 flex items-end justify-between gap-2">
                    <span className="font-semibold text-dark text-sm">India</span>
                    <ArrowRight size={18} className="shrink-0 text-dark-muted/40" />
                  </span>
                </div>
              </div>

              {/* Honest "no storefront" banner */}
              <div className="mt-6 rounded-2xl bg-background-warm/70 p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-5">
                <div className="shrink-0">
                  <svg viewBox="0 0 96 34" className="w-24 h-9 text-dark" fill="none" aria-hidden="true">
                    <path
                      d="M2 30 L20 10 L31 22 L44 6 L58 24 L70 14 L94 30"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M62 8 q4 -4 8 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M74 12 q4 -4 8 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <p className="font-display font-bold text-dark leading-snug mt-2">
                    More than trips,<br />we create memories.
                  </p>
                </div>
                <p className="text-dark-muted text-sm leading-relaxed sm:border-l sm:border-dark/10 sm:pl-5">
                  "We don't have a storefront — we run every trip from the road (and from WhatsApp).
                  That's how we keep things personal."
                </p>
              </div>
            </motion.div>

            {/* Message form */}
            <motion.div {...fadeUp(0.1)}>
              <div className="relative overflow-hidden rounded-3xl bg-white border border-background-warm shadow-warm-lg p-6 sm:p-8 md:p-10">
                {/* Decorative ripples, top-right */}
                <svg
                  viewBox="0 0 120 60"
                  className="pointer-events-none absolute -top-1 -right-2 w-40 h-20 text-primary/30"
                  fill="none"
                  aria-hidden="true"
                >
                  {[0, 12, 24, 36].map(offset => (
                    <path
                      key={offset}
                      d={`M0 ${12 + offset} q15 -10 30 0 t30 0 t30 0 t30 0`}
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  ))}
                </svg>

                {status === 'success' ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative text-center py-8 sm:py-10"
                  >
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                      className="inline-flex"
                    >
                      <CheckCircle size={64} weight="fill" className="text-green-500 mx-auto mb-4" />
                    </motion.div>
                    <h4 className="font-display text-xl sm:text-2xl font-bold text-dark mb-2">Message sent!</h4>
                    <p className="text-dark-muted max-w-sm mx-auto">
                      Thanks for reaching out — we'll get back to you within 24 hours.
                    </p>

                    <div className="mt-6 bg-background-warm/60 rounded-xl p-4 text-left max-w-sm mx-auto space-y-2">
                      <p className="text-sm font-semibold text-dark">What happens next</p>
                      <p className="text-sm text-dark-muted">1. We read every message ourselves — no bots.</p>
                      <p className="text-sm text-dark-muted">2. You'll hear back by email or WhatsApp, usually within a few hours.</p>
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                      <Button variant="outline" size="md" onClick={() => setStatus('idle')}>
                        Send another message
                      </Button>
                      <a
                        href={getWhatsAppLink(WHATSAPP_NUMBER)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md font-button font-semibold text-sm text-green-700 bg-green-50 hover:bg-green-100 transition-colors min-h-[44px]"
                      >
                        <WhatsAppIcon className="w-4 h-4" />
                        Chat on WhatsApp instead
                      </a>
                    </div>
                  </motion.div>
                ) : (
                  <div className="relative">
                    <span className="block w-12 h-[3px] rounded-full bg-primary" aria-hidden="true" />
                    <h3 className="font-display text-3xl sm:text-[2rem] font-bold text-dark mt-4">Send us a message</h3>
                    <p className="text-dark-muted text-sm sm:text-base mt-2">
                      Fill this in and we'll get back to you within a few hours.
                    </p>

                    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="relative">
                            <User size={18} className={iconClass} />
                            <input
                              id="contact-name"
                              placeholder="Your name *"
                              className={fieldClass(!!errors.name)}
                              {...register('name', { required: 'Enter your full name', validate: validateFullName })}
                            />
                          </div>
                          {errors.name && (
                            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                              <AlertCircle size={13} /> {errors.name.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <div className="relative">
                            <Phone size={18} className={iconClass} />
                            <input
                              id="contact-phone"
                              type="tel"
                              placeholder="Phone (optional)"
                              className={fieldClass(!!errors.phone)}
                              {...register('phone', { validate: (value) => validateOptionalPhone(value ?? '') })}
                            />
                          </div>
                          {errors.phone && (
                            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                              <AlertCircle size={13} /> {errors.phone.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="relative">
                          <EnvelopeSimple size={18} className={iconClass} />
                          <input
                            id="contact-email"
                            type="email"
                            placeholder="Email address *"
                            className={fieldClass(!!errors.email)}
                            {...register('email', { required: 'Enter your email', validate: validateEmail })}
                          />
                        </div>
                        {errors.email && (
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                            <AlertCircle size={13} /> {errors.email.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <div className="relative">
                          <ChatCircleDots size={18} className={`${iconClass} !top-4 !translate-y-0`} />
                          <textarea
                            id="contact-message"
                            rows={5}
                            placeholder="Tell us about your travel dreams..."
                            maxLength={MESSAGE_SOFT_LIMIT}
                            className={`${fieldClass(!!errors.message)} resize-none`}
                            {...register('message', {
                              required: 'Tell us a little about what you need',
                              minLength: { value: 10, message: 'A few more words would help us help you' },
                            })}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-1.5">
                          <span>
                            {errors.message && (
                              <p className="flex items-center gap-1 text-xs text-red-500">
                                <AlertCircle size={13} /> {errors.message.message}
                              </p>
                            )}
                          </span>
                          <span className="text-xs text-dark-muted/60 shrink-0">
                            {messageLength}/{MESSAGE_SOFT_LIMIT}
                          </span>
                        </div>
                      </div>

                      {status === 'error' && (
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3">
                          <AlertCircle size={16} />
                          <p className="text-sm">{errorMsg}</p>
                        </div>
                      )}

                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        fullWidth
                        loading={status === 'loading'}
                        className="!rounded-xl relative"
                      >
                        <Send size={18} weight="fill" />
                        Send Message
                        <ArrowRight size={18} className="absolute right-5" />
                      </Button>

                      <p className="flex items-center justify-center gap-1.5 text-xs text-dark-muted/70 pt-1">
                        <LockSimple size={13} />
                        We respect your privacy. Your information is safe with us.
                      </p>
                    </form>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Why travel with ULAA
         --------------------------------------------------------------- */}
      <section className="bg-cream px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="max-w-[1344px] mx-auto">
          <motion.div {...fadeUp()} className="text-center">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-dark">Why Travel with ULAA?</h2>
            <p className="text-dark-muted mt-2">Not just trips. A community of like-minded explorers.</p>
          </motion.div>

          <div className="mt-10 sm:mt-12 grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-6">
            {WHY_ULAA.map(({ Icon, title, description, circle }, index) => (
              <motion.div key={title} {...fadeUp(index * 0.08)} className="text-center px-2">
                <span className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${circle}`}>
                  <Icon size={28} />
                </span>
                <h3 className="font-display font-bold text-dark mt-4">{title}</h3>
                <p className="text-dark-muted text-sm mt-2 leading-relaxed">{description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
