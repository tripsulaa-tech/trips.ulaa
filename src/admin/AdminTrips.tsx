import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import DraftConflictNotice from './DraftConflictNotice';
import { useTripsData } from './trips/useTripsData';
import { useTripActions } from './trips/useTripActions';
import { useTripFormModal } from './trips/useTripFormModal';
import { useTripFinanceData } from './trips/useTripFinanceData';
import AdminTripsTable from './trips/AdminTripsTable';
import AdminTripFormModal from './trips/AdminTripFormModal';
import AdminTripViewModal from './trips/AdminTripViewModal';
import AdminTripCheckInModal from './trips/AdminTripCheckInModal';
import type { UpcomingTrip } from '../types/types-index';
import { useAlert } from '../components/ui/useAlert';

/** The Upcoming Trips admin page — everyone who's booking, or might book, a
 *  trip starts here.
 *
 *  This component is deliberately just an orchestrator: trip-list loading
 *  lives in useTripsData, per-row quick actions (publish, coming-soon,
 *  hide-PDF, download-PDF, delete) in useTripActions, and the Add/Edit
 *  modal's form state, save, field search, and Import/Export Template flow
 *  in useTripFormModal — see ./trips/ for those, plus the toolbar+table,
 *  create/edit modal, and read-only view modal components this file
 *  composes. Split out of a single ~2100-line AdminTrips.tsx for
 *  maintainability; see that file's git history for the original
 *  single-component version. */
export default function AdminTrips() {
  const alert = useAlert();
  const { trips, loading, load } = useTripsData();
  const [viewingTrip, setViewingTrip] = useState<UpcomingTrip | null>(null);
  const [checkInTrip, setCheckInTrip] = useState<UpcomingTrip | null>(null);
  const { revenueByTripId } = useTripFinanceData();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    pdfDownloadingId,
    handleDelete,
    togglePublish,
    toggleComingSoon,
    toggleHidePdfDownload,
    toggleBannerHasText,
    toggleHideSpecialOfferPromo,
    moveTrip,
    handleDownloadTripPdf,
  } = useTripActions(trips, load);

  const {
    modalOpen, closeModal, openCreate, openEdit,
    modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef,
    editingTrip, form, setForm, saving, handleSave,
    commitGroupBulletDraft,
    importInputRef, handleImportInputChange,
    handleExportTemplate,
    tripLeaders,
    stashDraftForLeaderDetour, resumeLeaderDraft,
    resumeKeptDraft, heldDraft, restoreHeldDraft, discardHeldDraft,
  } = useTripFormModal(load);

  const openEditFromView = (trip: UpcomingTrip) => {
    setViewingTrip(null);
    openEdit(trip);
  };

  // What this page should open once the trips have loaded, in priority order:
  //  1. coming back from Admin → Trip Leaders: the trip that was being edited (see
  //     openLeadersFromTrip below);
  //  2. an unsaved trip pop-up kept for this browser tab (leaving the page, or a refresh, no
  //     longer loses a half-filled trip);
  //  3. a request to jump straight into a specific trip's edit pop-up — used by the Dashboard's
  //     Upcoming Trips list, which links here with `state: { editTripId }`.
  // The navigation state is cleared afterwards so refreshing or going back doesn't reopen it.
  const pendingEditIdRef = useRef<string | null>(
    (location.state as { editTripId?: string } | null)?.editTripId ?? null
  );
  const resumeRef = useRef<{ assignLeaderId?: string } | null>(
    (location.state as { resumeTripDraft?: boolean; assignLeaderId?: string } | null)?.resumeTripDraft
      ? { assignLeaderId: (location.state as { assignLeaderId?: string }).assignLeaderId }
      : null
  );
  const startupDoneRef = useRef(false);
  useEffect(() => {
    if (loading || startupDoneRef.current) return;
    startupDoneRef.current = true;
    const detour = resumeRef.current;
    const pendingId = pendingEditIdRef.current;
    resumeRef.current = null;
    pendingEditIdRef.current = null;
    const resumedFromLeaders = detour ? resumeLeaderDraft(trips, detour.assignLeaderId) : false;
    if (!resumedFromLeaders && !resumeKeptDraft(trips) && pendingId) {
      const trip = trips.find(t => t.id === pendingId);
      if (trip) openEdit(trip);
    }
    if (detour || pendingId) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, loading]);

  // Trip Leader tab → "Edit this leader" / "Add a new leader": parks the
  // half-edited trip, then opens Admin → Trip Leaders with a way back.
  // Replacing the current history entry's state first means the browser Back
  // button also lands on the restored modal, not on a blank trips list.
  const openLeadersFromTrip = (target: { leaderId?: string; create?: boolean }) => {
    if (!stashDraftForLeaderDetour()) {
      alert('Could not keep your unsaved changes while leaving this page. Please save the trip first, then edit the leader.');
      return;
    }
    navigate(location.pathname, { replace: true, state: { resumeTripDraft: true } });
    navigate('/admin/trip-leaders', {
      state: {
        returnTo: {
          path: location.pathname,
          label: 'Back to trip',
          tripTitle: form.title || (editingTrip ? editingTrip.title : 'your new trip'),
        },
        editLeaderId: target.leaderId,
        createLeader: target.create,
      },
    });
  };

  return (
    <AdminLayout title="Upcoming Trips" scrollRestorationReady={!loading}>
      {heldDraft && (
        <DraftConflictNotice
          className="mb-4"
          subject={`the trip "${heldDraft.form.title || 'New trip'}"`}
          onRestore={() => restoreHeldDraft(trips)}
          onDiscard={discardHeldDraft}
        />
      )}
      <AdminTripsTable
        trips={trips}
        loading={loading}
        pdfDownloadingId={pdfDownloadingId}
        importInputRef={importInputRef}
        onImportInputChange={handleImportInputChange}
        onExportTemplate={handleExportTemplate}
        onAddTrip={openCreate}
        onView={setViewingTrip}
        onCheckIn={setCheckInTrip}
        onEdit={openEdit}
        onDelete={handleDelete}
        onTogglePublish={togglePublish}
        onToggleComingSoon={toggleComingSoon}
        onToggleHidePdf={toggleHidePdfDownload}
        onToggleBannerHasText={toggleBannerHasText}
        onToggleSpecialOfferPromo={toggleHideSpecialOfferPromo}
        onMoveTrip={moveTrip}
        onDownloadPdf={handleDownloadTripPdf}
      />

      <AdminTripFormModal
        modalOpen={modalOpen}
        closeModal={closeModal}
        editingTrip={editingTrip}
        form={form}
        setForm={setForm}
        modalSearch={modalSearch}
        setModalSearch={setModalSearch}
        modalSearchNoMatch={modalSearchNoMatch}
        modalBodyRef={modalBodyRef}
        saving={saving}
        handleSave={handleSave}
        commitGroupBulletDraft={commitGroupBulletDraft}
        actualRevenue={revenueByTripId(editingTrip?.id)}
        tripLeaders={tripLeaders}
        onManageLeader={openLeadersFromTrip}
      />

      <AdminTripViewModal
        trip={viewingTrip}
        onClose={() => setViewingTrip(null)}
        onEdit={openEditFromView}
        actualRevenue={revenueByTripId(viewingTrip?.id)}
      />

      <AdminTripCheckInModal key={checkInTrip?.id ?? 'closed'} trip={checkInTrip} onClose={() => setCheckInTrip(null)} />
    </AdminLayout>
  );
}
