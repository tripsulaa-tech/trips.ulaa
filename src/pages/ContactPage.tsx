import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import {
  Envelope as Mail,
  ChatDots as MessageSquare,
  MapPin,
  CheckCircle,
  WarningCircle as AlertCircle,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon';
import { submitContactEnquiry } from '../services/api';
import { getWhatsAppLink } from '../utils/utils-index';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { validateEmail } from '../utils/formValidation';

interface ContactForm {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

const WHATSAPP_NUMBER = '916381336772';
const HERO_IMAGE = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1400&q=80';

export default function ContactPage() {
  // Remember and restore scroll position when leaving/returning via the
  // bottom nav, same as the trips pages. The form is static, so there's no
  // async load to wait on before restoring.
  useScrollRestoration('/contact', true);

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ContactForm>();

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

  const inputClass = `w-full px-4 py-3 rounded-lg border-2 border-background-warm bg-background font-body text-dark placeholder-dark-muted/50 transition-all duration-200 outline-none focus:border-primary focus:bg-white`;

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-72 md:h-96 overflow-hidden">
        <img src={HERO_IMAGE} alt="Contact ULAA" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/50 to-dark/85" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className="text-secondary font-script font-medium text-2xl sm:text-3xl md:text-4xl block">Get in Touch</span>
            <h1 className="font-display text-4xl md:text-6xl font-bold mt-3">Contact Us</h1>
            <p className="text-white/80 mt-3 text-lg">We'd love to hear from you.</p>
          </motion.div>
        </div>
      </div>

      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-[1344px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-3xl font-bold text-dark mb-4">Let's talk.</h2>
              <p className="text-dark-muted text-lg leading-relaxed">
                Have questions about a trip? Want to plan something special? Or just want to say hi? We're always happy to chat.
              </p>
            </div>

            <div className="space-y-4">
              <a
                href={`mailto:trips.ulaa@gmail.com`}
                className="flex items-center gap-4 bg-white rounded-lg p-5 shadow-card hover:shadow-card-hover transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Mail size={22} />
                </div>
                <div>
                  <p className="font-semibold text-dark">Email Us</p>
                  <p className="text-dark-muted text-sm group-hover:text-primary transition-colors">trips.ulaa@gmail.com</p>
                </div>
              </a>

              <a
                href={getWhatsAppLink(WHATSAPP_NUMBER)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white rounded-lg p-5 shadow-card hover:shadow-card-hover transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                  <WhatsAppIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-dark">WhatsApp</p>
                  <p className="text-dark-muted text-sm group-hover:text-primary transition-colors">+91 63813 36772</p>
                </div>
              </a>

              <a
                href="https://www.instagram.com/ulaa.trips?igsh=MXhpbHdwOXhmamZsZw=="
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white rounded-lg p-5 shadow-card hover:shadow-card-hover transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <p className="font-semibold text-dark">Instagram</p>
                  <p className="text-dark-muted text-sm group-hover:text-primary transition-colors">@ulaa.trips</p>
                </div>
              </a>

              <div className="flex items-center gap-4 bg-white rounded-lg p-5 shadow-card">
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <MapPin size={22} />
                </div>
                <div>
                  <p className="font-semibold text-dark">Based In</p>
                  <p className="text-dark-muted text-sm">India — Exploring Everywhere</p>
                </div>
              </div>
            </div>

            {/* Google Maps placeholder */}
            <div className="rounded-lg overflow-hidden shadow-card h-52 bg-background-warm flex items-center justify-center">
              <div className="text-center text-dark-muted">
                <MapPin size={32} className="mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">Google Maps</p>
                <p className="text-xs">Location coming soon</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-white rounded-xl shadow-warm-lg p-8 md:p-10">
            <h3 className="font-display text-2xl font-bold text-dark mb-6">Send a Message</h3>

            {status === 'success' ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
                <h4 className="font-display text-xl font-bold text-dark mb-2">Message Sent!</h4>
                <p className="text-dark-muted">We'll get back to you within 24 hours.</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">Your Name *</label>
                  <input {...register('name', { required: 'Name is required' })} placeholder="Your name" className={inputClass} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">Email *</label>
                  <input type="email" {...register('email', { required: 'Email is required', validate: validateEmail })} placeholder="you@example.com" className={inputClass} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">Phone (Optional)</label>
                  <input type="tel" {...register('phone')} placeholder="+91 63813 36772" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">Message *</label>
                  <textarea {...register('message', { required: 'Message is required' })} rows={5} placeholder="Tell us about your travel dreams..." className={`${inputClass} resize-none`} />
                  {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message.message}</p>}
                </div>

                {status === 'error' && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3">
                    <AlertCircle size={16} />
                    <p className="text-sm">{errorMsg}</p>
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={status === 'loading'}>
                  Send Message
                </Button>
              </form>
            )}
          </div>
        </div>
        </div>
      </div>
    </Layout>
  );
}