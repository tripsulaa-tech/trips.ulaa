import { useState } from 'react';
import AdminLayout from './AdminLayout';
import { useTripsData } from './trips/useTripsData';
import { useTripForm } from './trips/useTripForm';
import { useTripImportExport } from './trips/useTripImportExport';
import { useTripModalSearch } from './trips/useTripModalSearch';
import AdminTripsTable from './trips/AdminTripsTable';
import AdminTripFormModal from './trips/AdminTripFormModal';
import AdminTripDetailModal from './trips/AdminTripDetailModal';
import type { UpcomingTrip } from '../types/types-index';

/** The Upcoming Trips admin page — deliberately just an orchestrator: the
 *  trips list/quick-actions live in useTripsData, the Add/Edit form's state
 *  in useTripForm, the Export/Import Template JSON round-trip in
 *  useTripImportExport, and the modal's field-search box in
 *  useTripModalSearch — see ./trips/ for those, plus the table, form modal,
 *  and detail modal components this file composes. Split out of a single
 *  ~2100-line AdminTrips.tsx for maintainability; see that file's git
 *  history for the original single-component version. */
export default function AdminTrips() {
  const { trips, loading, load, publishedCount, comingSoonCount, draftCount, pdfDownloadingId, handleDelete, togglePublish, toggleComingSoon, toggleHidePdfDownload, handleDownloadTripPdf } = useTripsData();

  const [viewingTrip, setViewingTrip] = useState<UpcomingTrip | null>(null);

  const {
    modalOpen, setModalOpen, editingTrip, setEditingTrip, saving, form, setForm, initialModalUrlsRef,
    closeModal, openCreate: openCreateForm, openEdit: openEditForm, handleSave, commitGroupBulletDraft,
  } = useTripForm(load);

  const { modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef, resetModalSearch } = useTripModalSearch(modalOpen);

  const { importInputRef, handleExportTemplate, handleImportInputChange } = useTripImportExport(
    setEditingTrip, setForm, initialModalUrlsRef, setModalOpen,
  );

  // Wraps the form hook's open handlers so the field-search box also resets
  // whenever the modal is (re)opened for a fresh trip.
  const openCreate = async () => { await openCreateForm(); resetModalSearch(); };
  const openEdit = (trip: UpcomingTrip) => { openEditForm(trip); resetModalSearch(); };

  return (
    <AdminLayout title="Upcoming Trips">
      <AdminTripsTable
        trips={trips}
        loading={loading}
        publishedCount={publishedCount}
        comingSoonCount={comingSoonCount}
        draftCount={draftCount}
        pdfDownloadingId={pdfDownloadingId}
        importInputRef={importInputRef}
        onImportChange={handleImportInputChange}
        onExportTemplate={handleExportTemplate}
        onCreate={openCreate}
        onView={setViewingTrip}
        onEdit={openEdit}
        onDelete={handleDelete}
        onTogglePublish={togglePublish}
        onToggleComingSoon={toggleComingSoon}
        onToggleHidePdfDownload={toggleHidePdfDownload}
        onDownloadPdf={handleDownloadTripPdf}
      />

      <AdminTripFormModal
        isOpen={modalOpen}
        onClose={closeModal}
        editingTrip={editingTrip}
        form={form}
        setForm={setForm}
        saving={saving}
        onSave={handleSave}
        modalSearch={modalSearch}
        setModalSearch={setModalSearch}
        modalSearchNoMatch={modalSearchNoMatch}
        modalBodyRef={modalBodyRef}
        commitGroupBulletDraft={commitGroupBulletDraft}
      />

      <AdminTripDetailModal
        viewingTrip={viewingTrip}
        onClose={() => setViewingTrip(null)}
        onEdit={trip => { setViewingTrip(null); openEdit(trip); }}
      />
    </AdminLayout>
  );
}
