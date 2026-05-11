import type { Client } from '@/types';
import { storage } from '@/utils/storage';
import type {
  ClientRepository,
  DeleteClientResult,
  DetachChildBaseNameResult,
} from '../types';

/**
 * 既存 storage.ts をラップする ClientRepository 実装。
 * Phase M-1 で create / update / delete / listChildren / detachChildBaseName を追加。
 * 引き続き他 Repository に依存しない（storage のみ参照）。
 */
export class LocalStorageClientRepository implements ClientRepository {
  list(): Client[] {
    return storage.getClients();
  }

  findById(id: string): Client | undefined {
    return storage.getClients().find((c) => c.id === id);
  }

  findForLogin(id: string, password: string): Client | undefined {
    // NOTE: 既存仕様の平文照合をそのまま踏襲。
    // 将来 authService に移してハッシュ照合 / Firebase Auth に差し替える。
    return storage.getClients().find((c) => c.id === id && c.password === password);
  }

  saveAll(clients: Client[]): void {
    storage.saveClients(clients);
  }

  create(client: Client): Client {
    const clients = storage.getClients();
    const existing = clients.find((c) => c.id === client.id);
    if (existing) {
      // 同 id 衝突時は idempotent: 既存を返し save を呼ばない
      return existing;
    }
    const next = [...clients, client];
    storage.saveClients(next);
    return client;
  }

  update(
    id: string,
    patch: Partial<Omit<Client, 'id' | 'password'>>,
  ): Client | undefined {
    const clients = storage.getClients();
    const idx = clients.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;

    const current = clients[idx];
    // patch から id / password を防御的に除去（型上は除外済みだが実行時保険）
    const { id: _ignoredId, password: _ignoredPw, ...safePatch } =
      patch as Partial<Client>;

    // 全フィールド同値なら no-op
    const keys = Object.keys(safePatch) as Array<keyof Client>;
    const hasChange = keys.some(
      (k) => (current as Client)[k] !== (safePatch as Client)[k],
    );
    if (!hasChange) return current;

    const updated: Client = { ...current, ...safePatch };
    const next = clients.slice();
    next[idx] = updated;
    storage.saveClients(next);
    return updated;
  }

  delete(id: string): DeleteClientResult {
    const clients = storage.getClients();
    const target = clients.find((c) => c.id === id);
    if (!target) {
      return { removed: false, deletedChildAccountCount: 0 };
    }

    // parent 削除なら配下 child も同時除去（AdminApp.handleDelete 互換）
    const isParent = target.accountType !== 'child';
    let deletedChildAccountCount = 0;
    const next = clients.filter((c) => {
      if (c.id === id) return false;
      if (isParent && c.accountType === 'child' && c.parentId === id) {
        deletedChildAccountCount += 1;
        return false;
      }
      return true;
    });

    storage.saveClients(next);
    return { removed: true, deletedChildAccountCount };
  }

  listChildren(parentId: string): Client[] {
    return storage
      .getClients()
      .filter((c) => c.accountType === 'child' && c.parentId === parentId);
  }

  detachChildBaseName(
    parentId: string,
    baseName: string,
  ): DetachChildBaseNameResult {
    const clients = storage.getClients();
    let detachedCount = 0;
    const next = clients.map((c) => {
      if (
        c.accountType === 'child' &&
        c.parentId === parentId &&
        c.baseName === baseName
      ) {
        detachedCount += 1;
        return { ...c, baseName: undefined };
      }
      return c;
    });
    if (detachedCount === 0) {
      return { detachedCount: 0 };
    }
    storage.saveClients(next);
    return { detachedCount };
  }
}
