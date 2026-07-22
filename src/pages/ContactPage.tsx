import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Mail, MessageSquare, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import { supabase } from '../services/supabase';
import { getWhatsAppLink } from '../utils';

interface ContactForm {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

const WHATSAPP_NUMBER = '916381336772';
const HERO_IMAGE = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1400&q=80';

export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ContactForm>();

  const onSubmit = async (data: ContactForm) => {
    try {
      setStatus('loading');
      await supabase.from('enquiries').insert({
        full_name: data.name,
        email: data.email,
        phone: data.phone || '',
        message: data.message,
      });
      setStatus('success');
      reset();
    } catch {
      setStatus('error');
    }
  };

  const inputClass = `w-full px-4 py-3 rounded-xl border-2 border-background-warm bg-background font-body text-dark placeholder-dark-muted/50 transition-all duration-200 outline-none focus:border-primary focus:bg-white`;

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-72 md:h-96 overflow-hidden">
        <img src={HERO_IMAGE} alt="Contact ULAA" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/50 to-dark/85" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className="text-secondary text-sm font-button font-semibold tracking-[0.2em] uppercase">Get in Touch</span>
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
                className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
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
                className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
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
                className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-600 flex items-center justify-center">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <p className="font-semibold text-dark">Instagram</p>
                  <p className="text-dark-muted text-sm group-hover:text-primary transition-colors">@ulaa.trips</p>
                </div>
              </a>

              <div className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-card">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <MapPin size={22} />
                </div>
                <div>
                  <p className="font-semibold text-dark">Based In</p>
                  <p className="text-dark-muted text-sm">India — Exploring Everywhere</p>
                </div>
              </div>
            </div>

            {/* Google Maps placeholder */}
            <div className="rounded-2xl overflow-hidden shadow-card h-52 bg-background-warm flex items-center justify-center">
              <div className="text-center text-dark-muted">
                <MapPin size={32} className="mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">Google Maps</p>
                <p className="text-xs">Location coming soon</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-white rounded-3xl shadow-warm-lg p-8 md:p-10">
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
                  <input type="email" {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' } })} placeholder="you@example.com" className={inputClass} />
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
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3">
                    <AlertCircle size={16} />
                    <p className="text-sm">Something went wrong. Please try again.</p>
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