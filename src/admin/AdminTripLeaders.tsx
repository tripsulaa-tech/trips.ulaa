import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  PencilSimple as Edit2,
  Trash as Trash2,
  Eye,
  EyeSlash as EyeOff,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
  ArrowLeft,
  CheckCircle,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import AddFab from '../components/ui/AddFab';
import Modal from '../components/ui/Modal';
import ImageUploadField from '../components/ui/ImageUploadField';
import {
  getAllTripLeadersAdmin, createTripLeader, updateTripLeader, deleteTripLeader,
} from '../services/api';
import { useConfirm } from '../components/ui/useConfirm';
import type { TripLeader, AboutFounderSocialLink } from '../types/types-index';
import { slugify } from '../utils/utils-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import { usePhotoDiscardOnClose } from './usePhotoDiscardOnClose';
import DraftConflictNotice from './DraftConflictNotice';
import {
  useDraftKeeper, modalDraftBase, resolveModalDraft, settleDraft, discardDraft, type ModalDraftValue,
} from '../hooks/useSessionDraft';
import { STORAGE_BUCKET } from '../constants/storage';
import { useToast } from '../components/ui/useToast';


interface TripLeaderForm {
  name: string;
  photo: string;
  designation: string;
  description: string;
  social_links: AboutFounderSocialLink[];
  is_published: boolean;
}

const emptyForm: TripLeaderForm = {
  name: '', photo: '', designation: '', description: '', social_links: [], is_published: true,
};

const LEADER_DRAFT_KEY = 'trip-leader-form';

function leaderToForm(t: TripLeader): TripLeaderForm {
  return {
    name: t.name, photo: t.photo || '', designation: t.designation || '',
    description: t.description, social_links: t.social_links || [], is_published: t.is_published,
  };
}

// Set by the Add/Edit Trip modal's Trip Leader tab (AdminTrips →
// openLeadersFromTrip) when it sends the admin here mid-edit. `returnTo`
// is where to go back to; `editLeaderId` / `createLeader` say which modal to
// open straight away.
interface ReturnTo { path: string; label: string; tripTitle: string }
interface LeadersNavState { returnTo?: ReturnTo; editLeaderId?: string; createLeader?: boolean }

export default function AdminTripLeaders() {
  const toast = useToast();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as LeadersNavState | null;
  const [returnTo] = useState<ReturnTo | null>(navState?.returnTo ?? null);
  const pendingOpenRef = useRef<{ editLeaderId?: string; create?: boolean } | null>(
    navState?.editLeaderId || navState?.createLeader
      ? { editLeaderId: navState.editLeaderId, create: navState.createLeader }
      : null
  );
  // Shown after a successful save while a trip edit is waiting.
  const [savedPrompt, setSavedPrompt] = useState<{ leaderId: string; created: boolean; name: string } | null>(null);

  const goBackToTrip = (assignLeaderId?: string) => {
    if (!returnTo) return;
    navigate(returnTo.path, { state: { resumeTripDraft: true, assignLeaderId } });
  };
  const [items, setItems] = useState<TripLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TripLeader | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripLeaderForm>(emptyForm);
  // The form as it was when the pop-up opened (blank, or built from the saved leader): what the
  // kept draft is measured against; and a kept draft held back because the leader changed.
  const [baseline, setBaseline] = useState<TripLeaderForm | null>(null);
  const [heldDraft, setHeldDraft] = useState<{ recordId: string | null; form: TripLeaderForm; baseline: TripLeaderForm } | null>(null);

  const load = () => {
    getAllTripLeadersAdmin().then(setItems).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const photoDiscard = usePhotoDiscardOnClose(STORAGE_BUCKET);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, is_published: true });
    setBaseline({ ...emptyForm, is_published: true });
    photoDiscard.track('');
    setModalOpen(true);
  };

  const openEdit = (t: TripLeader) => {
    setEditing(t);
    const editForm = leaderToForm(t);
    setForm(editForm);
    setBaseline(editForm);
    photoDiscard.track(t.photo || '');
    setModalOpen(true);
  };

  const openFromDraft = (recordId: string | null, draftForm: TripLeaderForm, draftBaseline: TripLeaderForm) => {
    setEditing(recordId ? items.find(t => t.id === recordId) ?? null : null);
    setForm(draftForm);
    setBaseline(draftBaseline);
    photoDiscard.track(draftBaseline.photo);
    setModalOpen(true);
  };

  // Reopens the pop-up as it was left when this page is opened again in the same browser tab
  // (or puts the draft on hold if the leader changed since the draft was started). Returns true
  // when there was a kept draft.
  const resumeKeptDraft = (): boolean => {
    const result = resolveModalDraft<TripLeaderForm>(LEADER_DRAFT_KEY, id => {
      if (id === null) return { ...emptyForm, is_published: true };
      const leader = items.find(t => t.id === id);
      return leader ? leaderToForm(leader) : null;
    });
    if (result.status === 'none') return false;
    const merged = { ...emptyForm, ...result.form };
    if (result.status === 'stale') setHeldDraft({ recordId: result.recordId, form: merged, baseline: result.baseline });
    else openFromDraft(result.recordId, merged, result.baseline);
    return true;
  };

  // Once the list has loaded, open (in priority order) the pop-up that was kept for this browser
  // tab, or the leader a trip's Trip Leader tab asked for: its edit modal (or the add modal). The
  // one-shot flags are then dropped from the history state (keeping returnTo so the banner
  // survives a refresh and the modal doesn't reopen on one).
  const startupDoneRef = useRef(false);
  useEffect(() => {
    if (loading || startupDoneRef.current) return;
    startupDoneRef.current = true;
    const pending = pendingOpenRef.current;
    pendingOpenRef.current = null;
    if (!resumeKeptDraft() && pending) {
      if (pending.editLeaderId) {
        const leader = items.find(t => t.id === pending.editLeaderId);
        if (leader) openEdit(leader);
      } else if (pending.create) {
        openCreate();
      }
    }
    if (pending) navigate(location.pathname, { replace: true, state: returnTo ? { returnTo } : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loading]);

  // Keep the pop-up's unsaved edits while they differ from where it started.
  const draftValue = useMemo<ModalDraftValue<TripLeaderForm>>(() => ({ recordId: editing?.id ?? null, form }), [editing, form]);
  useDraftKeeper({
    key: LEADER_DRAFT_KEY,
    value: draftValue,
    base: modalOpen && baseline ? modalDraftBase(editing?.id ?? null, baseline) : null,
  });

  const closeModal = () => {
    photoDiscard.discardIfUnsaved(form.photo);
    setModalOpen(false);
    discardDraft(LEADER_DRAFT_KEY);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const saved = editing
        ? await updateTripLeader(editing.id, form)
        : await createTripLeader({ ...form, sort_order: items.length });
      photoDiscard.markCommitted();
      setModalOpen(false);
      // Photos that were uploaded and then replaced before saving are deleted now.
      settleDraft(LEADER_DRAFT_KEY, new Set(form.photo ? [form.photo] : []));
      load();
      if (returnTo) setSavedPrompt({ leaderId: saved.id, created: !editing, name: form.name });
    } catch {
      toast.error("Couldn't save the trip leader.", { action: { label: 'Try again', onClick: () => { void handleSave(); } } });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Delete this trip leader?', confirmLabel: 'Delete' }))) return;
    await deleteTripLeader(id);
    load();
  };

  const togglePublish = async (t: TripLeader) => {
    await updateTripLeader(t.id, { is_published: !t.is_published });
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    await Promise.all([
      updateTripLeader(a.id, { sort_order: b.sort_order }),
      updateTripLeader(b.id, { sort_order: a.sort_order }),
    ]);
    load();
  };

  const updateSocial = (i: number, field: keyof AboutFounderSocialLink, value: string) => {
    const links = form.social_links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l));
    setForm(f => ({ ...f, social_links: links }));
  };
  const addSocial = () =>
    setForm(f => ({ ...f, social_links: [...f.social_links, { platform: '', url: '' }] }));
  const removeSocial = (i: number) =>
    setForm(f => ({ ...f, social_links: f.social_links.filter((_, idx) => idx !== i) }));

  return (
    <AdminLayout title="Trip Leaders" subtitle="Manage the directory of trip leaders that can be assigned to individual trips." scrollRestorationReady={!loading}>
      <div className="space-y-6">
        {heldDraft && (
          <DraftConflictNotice
            subject={`the trip leader "${heldDraft.form.name || 'New trip leader'}"`}
            onRestore={() => { openFromDraft(heldDraft.recordId, heldDraft.form, heldDraft.baseline); setHeldDraft(null); }}
            onDiscard={() => { discardDraft(LEADER_DRAFT_KEY); setHeldDraft(null); }}
          />
        )}
        {returnTo && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-sm text-dark min-w-0">
              You're editing a leader for <strong className="break-words">{returnTo.tripTitle}</strong>. Your unsaved trip changes are kept.
            </p>
            <Button variant="outline" size="sm" onClick={() => goBackToTrip()}>
              <ArrowLeft size={16} aria-hidden="true" /> {returnTo.label}
            </Button>
          </div>
        )}
        <div className="flex justify-between items-center">
          <p className="text-dark-muted">{items.length} trip leaders</p>
          <div className="hidden sm:block">
            <Button variant="primary" size="sm" onClick={openCreate}><Plus size={16} aria-hidden="true" /> Add Trip Leader</Button>
          </div>
        </div>
        <AddFab onClick={openCreate} label="Add trip leader" />

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-dark-muted bg-white rounded-lg shadow-card">No trip leaders yet.</div>
        ) : (
          <>
            {/* Mobile (below sm): a card per trip leader — the desktop
                table's hidden md/lg columns (designation, bio) meant a
                phone was left with only a cramped name/status/actions row,
                so this gives every field room to breathe instead. */}
            <div className="sm:hidden space-y-3">
              {items.map((t, index) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-lg shadow-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {t.photo ? (
                        <img src={t.photo} alt={t.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-background-warm flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-dark truncate">{t.name}</p>
                        {t.designation && (
                          <p className="text-xs text-dark-muted truncate">{t.designation}</p>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 text-2xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${t.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                      {t.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-sm text-dark-muted leading-relaxed line-clamp-3">{t.description}</p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-background-warm">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${t.name} up`}
                        className="p-2 rounded text-dark-muted hover:bg-background disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <ChevronUp size={15} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1}
                        aria-label={`Move ${t.name} down`}
                        className="p-2 rounded text-dark-muted hover:bg-background disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <ChevronDown size={15} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => togglePublish(t)} aria-label={t.is_published ? `Unpublish ${t.name}` : `Publish ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                        {t.is_published ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      </button>
                      <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} aria-hidden="true" /></button>
                      <button onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`} className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors"><Trash2 size={16} aria-hidden="true" /></button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Desktop (sm and up): the full table. */}
            <div className="hidden sm:block bg-white rounded-lg shadow-card overflow-hidden">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-sm">
                  <thead className="bg-background-warm text-dark font-medium">
                    <tr>
                      <th className="px-4 py-4 text-left">Trip Leader</th>
                      <th className="px-4 py-4 text-left hidden md:table-cell">Designation</th>
                      <th className="px-4 py-4 text-left hidden lg:table-cell">Bio</th>
                      <th className="px-4 py-4 text-center">Status</th>
                      <th className="px-4 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-background-warm">
                    {items.map((t, index) => (
                      <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                        <td className="px-4 py-4 font-medium text-dark">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                              <button onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${t.name} up`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronUp size={12} aria-hidden="true" /></button>
                              <button onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${t.name} down`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronDown size={12} aria-hidden="true" /></button>
                            </div>
                            {t.photo && <img src={t.photo} alt={t.name} className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />}
                            <span className="truncate max-w-[140px]">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-dark-muted hidden md:table-cell">{t.designation}</td>
                        <td className="px-4 py-4 text-dark-muted hidden lg:table-cell max-w-[280px] truncate">{t.description}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-xs font-button font-semibold px-3 py-1 rounded-md ${t.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                            {t.is_published ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => togglePublish(t)} aria-label={t.is_published ? `Unpublish ${t.name}` : `Publish ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                              {t.is_published ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                            </button>
                            <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} aria-hidden="true" /></button>
                            <button onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`} className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors"><Trash2 size={16} aria-hidden="true" /></button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Trip Leader' : 'Add Trip Leader'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tl-name" className="block text-sm font-medium text-dark mb-1">Name *</label>
            <input id="tl-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label htmlFor="tl-designation" className="block text-sm font-medium text-dark mb-1">Designation</label>
            <input id="tl-designation" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} className={inputClass} placeholder="e.g. Lead Trip Captain" aria-describedby="tl-designation-hint" />
            <p id="tl-designation-hint" className="text-xs text-dark-muted mt-1">Role shown under the name.</p>
          </div>
          <div className="md:col-span-2">
            <ImageUploadField
              label="Photo"
              value={form.photo}
              onChange={url => setForm(f => ({ ...f, photo: url }))}
              bucket={STORAGE_BUCKET}
              pathPrefix="trip-leader-photos"
              fileNamePrefix={slugify(form.name) || undefined}
              hint="Square, min 600×600px, face centered."
              allowUrl
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="tl-description" className="block text-sm font-medium text-dark mb-1">About / Bio *</label>
            <textarea id="tl-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} className={`${inputClass} resize-none`} aria-describedby="tl-description-hint" />
            <p id="tl-description-hint" className="text-xs text-dark-muted mt-1">Shown on the trip page and PDF.</p>
          </div>
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-dark mb-0">Social Links</label>
              <button
                type="button"
                onClick={addSocial}
                className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
              >
                <Plus size={13} aria-hidden="true" /> Add Link
              </button>
            </div>
            <p className="text-xs text-dark-muted -mt-1">
              Use a full URL, or just a username (e.g. "justjini_") for Instagram, LinkedIn, Facebook, X, YouTube, TikTok and Pinterest. WhatsApp: number with country code (e.g. "919876543210"). Mail: email address.
            </p>
            {form.social_links.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-36 flex-shrink-0">
                  <label htmlFor={`tl-social-platform-${i}`} className="sr-only">Social link {i + 1} platform</label>
                  <input
                    id={`tl-social-platform-${i}`}
                    value={link.platform}
                    onChange={e => updateSocial(i, 'platform', e.target.value)}
                    className={inputClass}
                    placeholder="Instagram"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label htmlFor={`tl-social-url-${i}`} className="sr-only">{link.platform || `Social link ${i + 1}`} URL or username</label>
                  <input
                    id={`tl-social-url-${i}`}
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
          <div className="md:col-span-2 flex items-center gap-3">
            <input type="checkbox" id="tlpub" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <label htmlFor="tlpub" className="text-sm font-medium text-dark">Publish immediately</label>
            <span className="text-xs text-dark-muted">Leave unchecked to save as a draft.</span>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={handleSave} loading={saving}>
            {editing ? 'Save Changes' : 'Add Trip Leader'}
          </Button>
        </div>
      </Modal>

      {/* "Done — go back?" popup, only when this visit came from a trip. */}
      <Modal
        isOpen={!!savedPrompt && !!returnTo}
        onClose={() => setSavedPrompt(null)}
        title={savedPrompt?.created ? 'Trip leader added' : 'Trip leader updated'}
        size="sm"
      >
        <div className="flex items-start gap-3">
          <CheckCircle size={28} weight="fill" className="text-green-600 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-dark">
            {savedPrompt?.created
              ? <><strong>{savedPrompt.name}</strong> was added and will be selected as the leader for </>
              : <>Your changes to <strong>{savedPrompt?.name}</strong> are saved. Ready to go back to </>}
            <strong>{returnTo?.tripTitle}</strong>?
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" className="flex-1" onClick={() => setSavedPrompt(null)}>Stay here</Button>
          <Button variant="primary" size="md" className="flex-1" onClick={() => goBackToTrip(savedPrompt?.created ? savedPrompt.leaderId : undefined)}>
            {returnTo?.label ?? 'Back to trip'}
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
