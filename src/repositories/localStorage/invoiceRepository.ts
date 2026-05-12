import type { InvoiceLog, InvoiceLine } from '@/types';
import { storage } from '@/utils/storage';
import type { InvoiceRepository } from '../types';

/**
 * 請求書 (`InvoiceLog`) の LocalStorage 実装 (Phase O-6b)。
 *
 * 仕様:
 *  - 1 client 配下の `ClientData.invoices: InvoiceLog[]` に対する CRUD を集約。
 *  - id 採番は呼出側責務（AdminApp の既存挙動を踏襲）。
 *  - InvoiceLine[] までは 2 階層 deep copy（読み出し側参照分離）。
 *
 * 既存 callsite との対応:
 *  - InvoiceSection.onUpdateInvoices → bulkUpsert
 *  - BulkInvoiceModal preview existing 取得 → findByYearMonth
 *  - BulkInvoiceModal.handleRun → upsert
 *  - openInvoiceEditor → findByYearMonth
 *  - handleSingleSave → upsert
 *  - invoiceByClient useMemo → findByYearMonth
 */
export class LocalStorageInvoiceRepository implements InvoiceRepository {
  list(clientId: string): InvoiceLog[] {
    const data = storage.getClientData(clientId);
    return (data.invoices || []).map((iv) => this.cloneInvoice(iv));
  }

  findByYearMonth(clientId: string, yearMonth: string): InvoiceLog | undefined {
    const data = storage.getClientData(clientId);
    const found = (data.invoices || []).find((iv) => iv.yearMonth === yearMonth);
    return found ? this.cloneInvoice(found) : undefined;
  }

  upsert(clientId: string, invoice: InvoiceLog): InvoiceLog {
    const data = storage.getClientData(clientId);
    const current = data.invoices || [];
    const idx = current.findIndex((iv) => iv.id === invoice.id);
    let next: InvoiceLog[];
    if (idx >= 0) {
      next = current.slice();
      next[idx] = invoice;
    } else {
      next = [...current, invoice];
    }
    storage.saveClientData(clientId, { ...data, invoices: next });
    return this.cloneInvoice(invoice);
  }

  bulkUpsert(clientId: string, invoices: InvoiceLog[]): InvoiceLog[] {
    const data = storage.getClientData(clientId);
    storage.saveClientData(clientId, { ...data, invoices });
    return invoices.map((iv) => this.cloneInvoice(iv));
  }

  private cloneInvoice(iv: InvoiceLog): InvoiceLog {
    return {
      ...iv,
      lines: (iv.lines || []).map((l: InvoiceLine) => ({ ...l })),
    };
  }
}
