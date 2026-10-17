import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowsOutCardinal, Plus, Shuffle, X, Heart, ShieldCheck, Compass, Users } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { AboutContent, AboutHaveYouEverItem, AboutWelcomeItem } from '../../types/types-index';
import { getTripHighlightIcon } from '../../constants/tripHighlightIcons';
import { localSiteImage } from '../../utils/imageUrls';
import fallbackPhoto from '../../assets/hero.webp';
import './mobile-memory-wall.css';

type Intro = AboutContent['journey_intro'];
const fallbackIcons = [Users, ShieldCheck, Compass, Heart];

// Match by meaning, never by position: admins can reorder both lists independently.
function matchingBenefit(item: AboutHaveYouEverItem, benefits: AboutWelcomeItem[]) {
  const text = `${item.text} ${item.icon ?? ''}`.toLowerCase();
  const pattern = /safe|shield/.test(text) ? /safe|shield/i
    : /cancel|plan/.test(text) ? /plan|stress/i
    : /alone|nervous|no one|company|friend/.test(text) ? /sister|people|community|users/i
    : /curat|experience/i;
  return benefits.find(benefit => pattern.test(`${benefit.title} ${benefit.icon}`));
}

function MemoryPhoto({ src }: { src: string }) {
  return <img src={localSiteImage(src) || fallbackPhoto} alt="" loading="lazy" decoding="async"
    draggable={false} onError={event => {
      if (event.currentTarget.dataset.fallback) return;
      event.currentTarget.dataset.fallback = 'true';
      event.currentTarget.src = fallbackPhoto;
    }} />;
}

function MemoryCard({ item, photo, index, onOpen }: {
  item: AboutHaveYouEverItem; photo: string; index: number; onOpen: () => void;
}) {
  const controls = useDragControls();
  const reduced = useReducedMotion();
  return <motion.article layout={!reduced} className="ulaa-memory-card" drag dragControls={controls}
    dragListener={false} dragConstraints={{ left: -8, right: 8, top: -8, bottom: 8 }}
    dragElastic={0} dragSnapToOrigin dragMomentum={false}
    whileDrag={{ zIndex: 3 }} transition={{ duration: reduced ? 0 : 0.25 }}>
    <div className={`ulaa-memory-print ulaa-memory-tilt-${index % 4}`}>
      <div className="ulaa-memory-photo">
        <MemoryPhoto key={photo} src={photo} />
        <button type="button" className="ulaa-memory-open" onClick={onOpen}
          aria-label={`Discover ULAA's response: ${item.text}`} aria-haspopup="dialog">
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>
      <p className="ulaa-memory-caption">{item.text}</p>
      <button type="button" className="ulaa-memory-drag" aria-label="Move this memory; use Shuffle the memories to rearrange"
        onPointerDown={event => { if (event.button === 0) controls.start(event); }}>
        <ArrowsOutCardinal size={17} aria-hidden="true" /><span>Move</span>
      </button>
    </div>
  </motion.article>;
}

// Retain the original filename so this patch also upgrades the mobile-only release.
export default function MobileMemoryWall({ intro, photos }: { intro: Intro; photos: string[] }) {
  const [shift, setShift] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const { have_you_ever: worries, welcome_to_ulaa: welcome } = intro;
  const items = worries.items;
  const selectedItem = selected === null ? undefined : items[selected];
  const benefit = selectedItem ? matchingBenefit(selectedItem, welcome.items) : undefined;
  const photoAt = (index: number) => photos.length ? photos[index % photos.length] : fallbackPhoto;

  useEffect(() => {
    if (selected === null) return;
    const node = dialog.current;
    if (!node) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = previousOverflow;
      opener.current?.focus({ preventScroll: true });
    };
  }, [selected]);

  const phrase = 'beautiful experiences';
  const phraseIndex = intro.description.toLowerCase().indexOf(phrase);
  const order = items.map((_, index) => (index + shift) % items.length);

  return <section className="ulaa-mobile-memories" aria-labelledby="mobile-memory-heading">
    <header className="ulaa-memory-intro">
      {intro.sub_heading && <p className="ulaa-memory-eyebrow font-script">{intro.sub_heading}</p>}
      <h2 id="mobile-memory-heading">{intro.heading}</h2>
      {intro.description && <p className="ulaa-memory-description">{phraseIndex < 0 ? intro.description : <>
        {intro.description.slice(0, phraseIndex)}<span>{intro.description.slice(phraseIndex, phraseIndex + phrase.length)}</span>{intro.description.slice(phraseIndex + phrase.length)}
      </>}</p>}
    </header>
    <div className="ulaa-memory-section-heading"><h3>{worries.heading}</h3><span aria-hidden="true" /></div>
    {items.length > 0 && <>
      <p className="ulaa-memory-hint">Tap + to discover · Drag the arrow handle to play.</p>
      <div className="ulaa-memory-wall">
        {order.map(index => <MemoryCard key={`${index}:${items[index].text}`} item={items[index]} index={index}
          photo={photoAt(index)} onOpen={() => setSelected(index)} />)}
      </div>
      {items.length > 1 && <button type="button" className="ulaa-memory-shuffle" onClick={() => setShift(value => value + 1)}>
        <Shuffle size={19} aria-hidden="true" />Shuffle the memories
      </button>}
      <span className="sr-only" role="status">{shift > 0 ? 'Memories rearranged. All questions are available below the photos.' : ''}</span>
    </>}
    <div className="ulaa-memory-welcome">
      <div className="ulaa-memory-section-heading"><h3>{welcome.heading}</h3><span aria-hidden="true" /></div>
      {welcome.subheading && <p className="ulaa-memory-hint">{welcome.subheading}</p>}
      <div className="ulaa-memory-benefits">
        {welcome.items.map((item, index) => {
          const Icon = getTripHighlightIcon(item.icon)?.Icon ?? fallbackIcons[index % fallbackIcons.length];
          return <div key={`${index}:${item.title}`} className="ulaa-memory-benefit">
            <Icon size={28} weight="regular" aria-hidden="true" /><p>{item.title}</p>
          </div>;
        })}
      </div>
    </div>
    <footer className="ulaa-memory-footer"><p>Your next memory could start here.</p>
      <Link to="/trips" className="ulaa-memory-cta">Explore Trips<ArrowRight size={16} aria-hidden="true" /></Link>
    </footer>
    {selectedItem && createPortal(<dialog ref={dialog} className="ulaa-memory-dialog"
      aria-labelledby="memory-detail-title" aria-describedby="memory-detail-description"
      onCancel={event => { event.preventDefault(); setSelected(null); }}
      onClick={event => { if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setSelected(null);
      } }}>
      <button type="button" autoFocus className="ulaa-memory-close" aria-label="Close memory" onClick={() => setSelected(null)}><X size={22} /></button>
      <div className="ulaa-memory-detail-photo"><MemoryPhoto src={photoAt(selected!)} /></div>
      <div className="ulaa-memory-detail-copy">
        <p className="ulaa-memory-detail-question">{selectedItem.text}</p>
        <h3 id="memory-detail-title">{benefit?.title || welcome.heading}</h3>
        <div id="memory-detail-description">{benefit ? <p>{benefit.description}</p> : welcome.items.map((item, index) => <p key={index}><strong>{item.title}</strong> — {item.description}</p>)}</div>
        <Link to="/trips" className="ulaa-memory-cta" onClick={() => setSelected(null)}>Explore Trips<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </dialog>, document.body)}
  </section>;
}
