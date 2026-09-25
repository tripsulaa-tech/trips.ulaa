import { supabase } from '../supabase';
import type { InvoiceGeneratorRecord, InvoiceGeneratorRecordInput } from '../../types/types-index';

// =============================================
// Invoice Generator (Admin → Invoice Generator, standalone tool)
// =============================================
// See supabase/migration/add_invoice_generator_records.sql for the table
// this talks to, and add_invoice_generator_series_numbering.sql for the
// numbering trigger/peek function.

/** Asks the database what the next invoice number will probably be —
 *  coalesce(max(invoice_seq), 0) + 1, formatted with the given prefix. This
 *  is a read-only peek (next_invoice_generator_number() doesn't reserve or
 *  increment anything) used purely to show a live preview in the form
 *  before saving. The number actually written to a row is decided at
 *  INSERT time by the assign_invoice_generator_number() trigger, which is
 *  what guarantees the saved series (JJ001, JJ002, JJ003…) never has gaps
 *  or collisions even if two admins are saving around the same moment —
 *  see supabase/migration/add_invoice_generator_series_numbering.sql. */
export async function getNextInvoiceGeneratorNumber(prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_invoice_generator_number', { p_prefix: prefix || 'JJ' });
  if (error) throw error;
  return data as string;
}

/** Every saved invoice, newest first — same pattern as
 *  getCreatorRateCalculations: a small, unbounded list for now. */
export async function getInvoiceGeneratorInvoices(): Promise<InvoiceGeneratorRecord[]> {
  const { data, error } = await supabase
    .from('invoice_generator_invoices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Persists a generated invoice so it can be browsed and reused later
 *  (same client billing details, bank details, etc. for a repeat
 *  invoice). The row's actual invoice_number/invoice_seq are assigned by
 *  the database on insert (see assign_invoice_generator_number()) — any
 *  invoice_number on `invoice` is ignored, so always read it back off the
 *  returned record rather than assuming what was passed in was used. */
export async function saveInvoiceGeneratorInvoice(invoice: InvoiceGeneratorRecordInput): Promise<InvoiceGeneratorRecord> {
  const { data, error } = await supabase
    .from('invoice_generator_invoices')
    .insert(invoice)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInvoiceGeneratorInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoice_generator_invoices').delete().eq('id', id);
  if (error) throw error;
}
