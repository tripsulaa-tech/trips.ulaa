import {
  Plus,
  Trash as Trash2,
} from '@phosphor-icons/react';
import ImageUploadField from '../../components/ui/ImageUploadField';
import { COVER_IMAGE_TARGET_SIZE_BYTES } from '../../services/api';
import type { FounderContent, AboutFounderSocialLink } from '../../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import { labelClass } from '../about-sections/shared';

export default function FounderSection({
  content,
  setContent,
  sectionRef,
}: {
  content: FounderContent;
  setContent: React.Dispatch<React.SetStateAction<FounderContent>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const setFounder = (field: keyof FounderContent, value: unknown) =>
    setContent(p => ({ ...p, [field]: value }));

  const updateSocial = (i: number, field: keyof AboutFounderSocialLink, value: string) => {
    const links: AboutFounderSocialLink[] = content.social_links.map(
      (l: AboutFounderSocialLink, idx: number) => (idx === i ? { ...l, [field]: value } : l),
    );
    setFounder('social_links', links);
  };
  const addSocial = () =>
    setFounder('social_links', [...content.social_links, { platform: '', url: '' }]);
  const removeSocial = (i: number) =>
    setFounder('social_links', content.social_links.filter((_: unknown, idx: number) => idx !== i));

  return (
    <div ref={sectionRef} data-section={5} className="scroll-mt-4 space-y-4">
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Meet the Founder</h2>
      <p className="text-xs text-dark-muted -mt-2">
        This single source is shown on the About page, the Home page, and the Upcoming Trips page — edit it once here and it updates everywhere.
      </p>
      <ImageUploadField
        label="Founder Photo"
        value={content.photo}
        onChange={url => setFounder('photo', url)}
        bucket="ulaa"
        pathPrefix="founder"
        maxSizeBytes={COVER_IMAGE_TARGET_SIZE_BYTES}
        hint="Square, at least 600×600px, with the face centered."
        allowUrl
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="founder-name" className={labelClass}>Name</label>
          <input
            id="founder-name"
            value={content.name}
            onChange={e => setFounder('name', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="founder-designation" className={labelClass}>Designation</label>
          <input
            id="founder-designation"
            value={content.designation}
            onChange={e => setFounder('designation', e.target.value)}
            className={inputClass}
            placeholder="Founder & CEO, ULAA"
          />
        </div>
      </div>
      <div>
        <label htmlFor="founder-description" className={labelClass}>About / Description</label>
        <textarea
          id="founder-description"
          value={content.description}
          onChange={e => setFounder('description', e.target.value)}
          rows={4}
          className={`${inputClass} resize-none`}
        />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className={`${labelClass} mb-0`}>Social Links</label>
          <button
            type="button"
            onClick={addSocial}
            className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
          >
            <Plus size={13} aria-hidden="true" /> Add Link
          </button>
        </div>
        <p className="text-xs text-dark-muted -mt-1">
          Full URLs work best, but a bare username (e.g. "justjini_") also works for Instagram, LinkedIn, Facebook, X, YouTube, TikTok, and Pinterest. For WhatsApp, enter a phone number with country code (e.g. "919876543210"). For Mail/Gmail, enter the email address.
        </p>
        {content.social_links.map((link: AboutFounderSocialLink, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-36 flex-shrink-0">
              <label htmlFor={`founder-social-platform-${i}`} className="sr-only">Social link {i + 1} platform</label>
              <input
                id={`founder-social-platform-${i}`}
                value={link.platform}
                onChange={e => updateSocial(i, 'platform', e.target.value)}
                className={inputClass}
                placeholder="Instagram"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor={`founder-social-url-${i}`} className="sr-only">{link.platform || `Social link ${i + 1}`} URL or username</label>
              <input
                id={`founder-social-url-${i}`}
                value={link.url}
                onChange={e => updateSocial(i, 'url', e.target.value)}
                className={inputClass}
                placeholder="justjini_ or https://instagram.com/justjini_"
              />
            </div>
            <button
              type="button"
              onClick={() => removeSocial(i)}
              aria-label={`Remove ${link.platform || `social link ${i + 1}`}`}
              className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
