import type { ClientData } from '@/types';
import { storage } from '@/utils/storage';
import type { ClientDataRepository } from '../types';

/**
 * 既存 storage.ts をラップする ClientDataRepository 実装。
 *
 * 既存の getClientData は「未存在時にデフォルトデータを生成して保存する」副作用を持つが、
 * これは現状の挙動互換のためにそのまま残す（呼び出し側で前提にしている箇所がある）。
 * 将来 Firestore 化する際は init を別関数に分離する。
 */
export class LocalStorageClientDataRepository implements ClientDataRepository {
  get(clientId: string): ClientData {
    return storage.getClientData(clientId);
  }

  save(clientId: string, data: ClientData): void {
    storage.saveClientData(clientId, data);
  }

  delete(clientId: string): void {
    storage.deleteClientData(clientId);
  }
}
