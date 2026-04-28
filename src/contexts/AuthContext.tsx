import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Client, ClientData, ClientOperationLog } from '@/types';
import { storage, getDefaultClientData } from '@/utils/storage';
import { pushClientLog } from '@/utils/clientLog';

export interface AuthState {
  isLoggedIn: boolean;
  client: Client | null;
  clientData: ClientData | null;
}

type LogCategory = ClientOperationLog['category'];

interface AuthContextValue extends AuthState {
  login: (clientId: string, password: string) => boolean;
  logout: () => void;
  updateClientData: (updater: (data: ClientData) => ClientData) => void;
  reloadClientData: () => void;
  /** storage から最新の Client を読み直して state に反映（オプション情報の同期等に使用） */
  refreshClient: () => void;
  logAction: (category: LogCategory, action: string, target: string, detail?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

function filterDataByBase(data: ClientData, baseName: string): ClientData {
  return {
    ...data,
    applicants: data.applicants.filter((a) => a.base === baseName),
    events: data.events.filter((e) => e.base === baseName),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);

  const resolveClientId = useCallback((c: Client): string => {
    return c.accountType === 'child' && c.parentId ? c.parentId : c.id;
  }, []);

  const loadClientData = useCallback(
    (c: Client) => {
      const dataId = resolveClientId(c);
      let data = storage.getClientData(dataId);

      // 子アカウントの場合、拠点でフィルタ
      if (c.accountType === 'child' && c.baseName) {
        data = filterDataByBase(data, c.baseName);
      }
      setClientData(data);
    },
    [resolveClientId]
  );

  const login = useCallback(
    (clientId: string, password: string): boolean => {
      const clients = storage.getClients();
      const found = clients.find((c) => c.id === clientId && c.password === password);
      if (!found) return false;
      if (found.status === 'inactive') return false;

      // 子アカウントは親のオプションを継承（オプションは親契約単位で管理）
      let effective = found;
      if (found.accountType === 'child' && found.parentId) {
        const parent = clients.find((c) => c.id === found.parentId);
        if (parent?.options) {
          effective = { ...found, options: parent.options };
        }
      }

      setClient(effective);
      loadClientData(effective);
      // ログ記録
      const dataId = found.accountType === 'child' && found.parentId ? found.parentId : found.id;
      const operator = found.accountType === 'parent'
        ? (found.contactName || found.companyName)
        : `${found.companyName}${found.baseName ? ' / ' + found.baseName : ''}`;
      pushClientLog(dataId, {
        operator,
        category: 'auth',
        action: 'ログイン',
        target: found.companyName,
      });
      return true;
    },
    [loadClientData]
  );

  const logout = useCallback(() => {
    if (client) {
      const dataId = client.accountType === 'child' && client.parentId ? client.parentId : client.id;
      const operator = client.accountType === 'parent'
        ? (client.contactName || client.companyName)
        : `${client.companyName}${client.baseName ? ' / ' + client.baseName : ''}`;
      pushClientLog(dataId, {
        operator,
        category: 'auth',
        action: 'ログアウト',
        target: client.companyName,
      });
    }
    setClient(null);
    setClientData(null);
  }, [client]);

  const logAction = useCallback(
    (category: LogCategory, action: string, target: string, detail?: string) => {
      if (!client) return;
      const dataId = resolveClientId(client);
      const operator = client.accountType === 'parent'
        ? (client.contactName || client.companyName)
        : `${client.companyName}${client.baseName ? ' / ' + client.baseName : ''}`;
      pushClientLog(dataId, { operator, category, action, target, detail });
    },
    [client, resolveClientId]
  );

  const updateClientData = useCallback(
    (updater: (data: ClientData) => ClientData) => {
      if (!client) return;
      const dataId = resolveClientId(client);
      const current = storage.getClientData(dataId);
      const updated = updater(current);
      storage.saveClientData(dataId, updated);

      // 子アカウントの場合、フィルタした結果をstateに
      if (client.accountType === 'child' && client.baseName) {
        setClientData(filterDataByBase(updated, client.baseName));
      } else {
        setClientData(updated);
      }
    },
    [client, resolveClientId]
  );

  const reloadClientData = useCallback(() => {
    if (client) {
      loadClientData(client);
    }
  }, [client, loadClientData]);

  /**
   * storage から最新の Client を取得し、子アカウントなら親オプションも継承しなおす
   * - incrementOptionUsage 後の使用回数同期
   * - 親アカウント側で options が変わった時の同期
   */
  const refreshClient = useCallback(() => {
    if (!client) return;
    const all = storage.getClients();
    const fresh = all.find((c) => c.id === client.id);
    if (!fresh) return;
    let effective: Client = fresh;
    if (fresh.accountType === 'child' && fresh.parentId) {
      const parent = all.find((c) => c.id === fresh.parentId);
      if (parent?.options) {
        effective = { ...fresh, options: parent.options };
      }
    }
    setClient(effective);
  }, [client]);

  // 初期化: デモ用にデフォルトクライアントが無い場合は作成
  useEffect(() => {
    const clients = storage.getClients();
    const hasDemo = clients.some(c => c.id === 'demo');
    if (!hasDemo) {
      const defaultClient: Client = {
        id: 'demo',
        companyName: 'デモ企業',
        password: 'demo',
        accountType: 'parent',
        plan: 'professional',
        status: 'active',
        contractStart: '2026-01-01',
        contractEnd: '2026-12-31',
        contactName: '管理者 太郎',
        contactEmail: 'admin@risotto.co.jp',
        memo: 'デモ用アカウント',
        permissions: {
          status: true,
          source: true,
          base: true,
          job: true,
          hearing: true,
          filtercond: true,
          mailtemplate: true,
          exclusion: true,
          chatbot: true,
        },
        members: [
          { id: 1, name: '管理者 太郎', email: 'admin@risotto.co.jp', phone: '09012345678', notifyEmail: true, notifySms: false },
          { id: 2, name: '採用 花子', email: 'hanako@risotto.co.jp', phone: '08098765432', notifyEmail: true, notifySms: true },
        ],
        notificationEmail: 'admin@risotto.co.jp',
        smsPhone: '09012345678',
      };
      const updatedClients = clients.filter(c => c.id !== 'demo');
      updatedClients.push(defaultClient);
      storage.saveClients(updatedClients);
      storage.saveClientData('demo', getDefaultClientData());
    }
  }, []);

  const value: AuthContextValue = {
    isLoggedIn: !!client,
    client,
    clientData,
    login,
    logout,
    updateClientData,
    reloadClientData,
    refreshClient,
    logAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
