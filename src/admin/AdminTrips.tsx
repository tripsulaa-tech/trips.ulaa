import { useState } from 'react';
import AdminLayout from './AdminLayout';
import { useTripsData } from './trips/useTripsData';
import { useTripActions } from './trips/useTripActions';
import { useTripFormModal } from './trips/useTripFormModal';
import { useTripFinanceData } from './trips/useTripFinanceData';
import AdminTripsTable from './trips/AdminTripsTable';
import AdminTripFormModal from './trips/AdminTripFormModal';
import AdminTripViewModal from './trips/AdminTripViewModal';
import type { UpcomingTrip } from '../types/types-index';

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
  const { trips, loading, load } = useTripsData();
  const [viewingTrip, setViewingTrip] = useState<UpcomingTrip | null>(null);
  const { revenueByTripId } = useTripFinanceData();

  const {
    pdfDownloadingId,
    handleDelete,
    togglePublish,
    toggleComingSoon,
    toggleHidePdfDownload,
    handleDownloadTripPdf,
  } = useTripActions(load);

  const {
    modalOpen, closeModal, openCreate, openEdit,
    modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef,
    editingTrip, form, setForm, saving, handleSave,
    commitGroupBulletDraft,
    importInputRef, handleImportInputChange,
    handleExportTemplate,
  } = useTripFormModal(load);

  const openEditFromView = (trip: UpcomingTrip) => {
    setViewingTrip(null);
    openEdit(trip);
  };

  return (
    <AdminLayout title="Upcoming Trips">
      <AdminTripsTable
        trips={trips}
        loading={loading}
        pdfDownloadingId={pdfDownloadingId}
        importInputRef={importInputRef}
        onImportInputChange={handleImportInputChange}
        onExportTemplate={handleExportTemplate}
        onAddTrip={openCreate}
        onView={setViewingTrip}
        onEdit={openEdit}
        onDelete={handleDelete}
        onTogglePublish={togglePublish}
        onToggleComingSoon={toggleComingSoon}
        onToggleHidePdf={toggleHidePdfDownload}
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
      />

      <AdminTripViewModal
        trip={viewingTrip}
        onClose={() => setViewingTrip(null)}
        onEdit={openEditFromView}
        actualRevenue={revenueByTripId(viewingTrip?.id)}
      />
    </AdminLayout>
  );
}
