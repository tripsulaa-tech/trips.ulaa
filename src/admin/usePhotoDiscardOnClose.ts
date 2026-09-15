import { useRef } from 'react';
import { deleteImageByUrl } from '../services/api';

/**
 * Tracks the single photo URL a create/edit modal opened with, and cleans up
 * any newer upload left behind if the modal is closed without saving —
 * shared by AdminTripLeaders and the Testimonials editor, which each have
 * exactly one photo field per record. (The Add/Edit Trip modal tracks a
 * whole Set of URLs across several image fields instead — see
 * useTripFormModal's own initialModalUrlsRef — so it doesn't use this.)
 *
 * Call `track(initialPhoto)` whenever the modal opens (pass '' for create,
 * the existing photo for edit), `discardIfUnsaved(currentPhoto)` when the
 * modal is closed without saving, and `markCommitted()` right after a
 * successful save — mirroring the three call sites each caller already had.
 */
export function usePhotoDiscardOnClose(bucket: string) {
  const initialPhotoRef = useRef('');
  const isStorageUrl = (url: string) => url.includes(`/object/public/${bucket}/`);

  const track = (initialPhoto: string) => {
    initialPhotoRef.current = initialPhoto;
  };

  // Any storage URL present at close-time that wasn't the one the modal
  // opened with was uploaded during this session but never saved — delete
  // it best-effort so it doesn't orphan in storage.
  const discardIfUnsaved = (currentPhoto: string) => {
    const initial = initialPhotoRef.current;
    if (currentPhoto && currentPhoto !== initial && isStorageUrl(currentPhoto)) {
      deleteImageByUrl(bucket, currentPhoto).catch(() => {});
    }
    initialPhotoRef.current = '';
  };

  // The upload is now committed (DB row saved/updated) — nothing to clean
  // up if the modal closes right after.
  const markCommitted = () => {
    initialPhotoRef.current = '';
  };

  return { track, discardIfUnsaved, markCommitted, isStorageUrl };
}
