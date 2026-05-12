import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Client, ClientData, ClientOperationLog } from '@/types';
import { getDefaultClientData } from '@/utils/storage';
import {
  clientRepository,
  clientDataRepository,
  resolveDataOwnerId as resolveDataOwnerIdShared,
} from '@/repositories';
import { authService } from '@/services/auth';
import type { LoginResult, SafeClient } from '@/services/auth';
import { pushClientLog } from '@/utils/clientLog';

export interface AuthState {
  isLoggedIn: boolean;
  /**
   * I-5: state を SafeClient (= Omit<Client, 'password'>) 化。
   * 画面側から平文パスワードへの直接アクセス経路を完全に閉鎖。
   * パスワード変更は authService.changePassword 経由のみ可能。
   */
  client: SafeClient | null;
  clientData: ClientData | null;
}

type LogCategory = ClientOperationLog['category'];

interface AuthContextValue extends AuthState {
  /**
   * I-4: 戻り値を boolean → LoginResult に変更。
   * Login.tsx が inactive / invalid_credentials を区別したエラー表示に使う。
   * 成功時は { ok: true, session } 形式 (session は authService から SafeClient を含む)。
   */
  login: (clientId: string, password: string) => LoginResult;
  logout: () => void;
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

/**
 * I-5: 子アカウントの親オプション継承を SafeClient ベースで適用するヘルパー。
 * authService 内の applyParentOptions と同じロジックだが、画面側で
 * sessionStorage 復元後 / login 後 / refreshClient 後に適用するため複製。
 * 親 options を返さない場合は引数の SafeClient をそのまま返す。
 */
function applyParentOptions(safe: SafeClient): SafeClient {
  if (safe.accountType === 'child' && safe.parentId) {
    const parent = clientRepository.findById(safe.parentId);
    if (parent?.options) {
      return { ...safe, options: parent.options };
    }
  }
  return safe;
}

/**
 * I-5: clientRepository から取得した Client を SafeClient に剥がす。
 * 画面側 state には SafeClient しか入れない方針のため境界用。
 */
function toSafeClient(c: Client): SafeClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safe } = c;
  return safe;
}

function filterDataByBase(data: ClientData, baseName: string): ClientData {
  // slotSettings は拠点別キーマップなので自拠点のみに絞る
  const ownSlot = data.slotSettings?.[baseName];
  return {
    ...data,
    applicants: data.applicants.filter((a) => a.base === baseName),
    events: data.events.filter((e) => e.base === baseName),
    slotSettings: ownSlot ? { [baseName]: ownSlot } : {},
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // sessionStorage 復元 + 親オプション継承。
  // I-2a:
  //  - sessionStorage 直読みは authService.restoreSessionSync() に委譲。SafeClient で返る。
  //  - 旧フォーマット (password 入り Client が sessionStorage に残っているケース) は restoreSessionSync 内で
  //    SafeClient に書き直されるので、本ブロック以降に password 平文は sessionStorage に戻らない。
  // I-5:
  //  - state 型を SafeClient | null に変更。clientRepository から password を引き直すダンスを廃止。
  //  - clientRepository.findById で「最新化」する処理は restoreSessionSync が常に latest を返すわけではないため
  //    保険として残す (ステータス inactive 化 / 削除済の検知)。ただし戻り値は SafeClient に剥がす。
  //  - 親オプション継承は applyParentOptions に切り出し。
  const [client, setClient] = useState<SafeClient | null>(() => {
    const session = authService.restoreSessionSync();
    if (!session) return null;
    try {
      const fresh = clientRepository.findById(session.client.id);
      if (!fresh) return null;
      return applyParentOptions(toSafeClient(fresh));
    } catch {
      return null;
    }
  });
  const [clientData, setClientData] = useState<ClientData | null>(null);

  // client 変更時の sessionStorage 同期は authService に集約。直接 setItem しない。
  // I-5: state が SafeClient になったため persistSession に直接渡せる
  // (persistSession の引数型は Client 互換だが SafeClient は構造的部分集合なので問題なし)。
  useEffect(() => {
    if (client) authService.persistSession(client as Client);
    else authService.clearSession();
  }, [client]);

  // 復元された client がある場合、clientData を初回ロード
  // (client 自体の最新化は initState で完結)
  useEffect(() => {
    if (client && !clientData) {
      const dataId = resolveDataOwnerIdShared(client);
      try {
        let data = clientDataRepository.get(dataId);
        if (client.accountType === 'child' && client.baseName) {
          data = filterDataByBase(data, client.baseName);
        }
        setClientData(data);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveClientId = useCallback((c: SafeClient): string => {
    return resolveDataOwnerIdShared(c);
  }, []);

  const loadClientData = useCallback(
    (c: SafeClient) => {
      const dataId = resolveClientId(c);
      let data = clientDataRepository.get(dataId);

      // 子アカウントの場合、拠点でフィルタ
      if (c.accountType === 'child' && c.baseName) {
        data = filterDataByBase(data, c.baseName);
      }
      setClientData(data);
    },
    [resolveClientId]
  );

  const login = useCallback(
    (clientId: string, password: string): LoginResult => {
      // I-2b: 認証照合 + sessionStorage 永続は authService に集約。
      // I-4: 戻り値を boolean → LoginResult に変更し、Login.tsx 側で
      //      inactive / invalid_credentials を区別したエラー表示が可能になった。
      const result = authService.loginSync(clientId, password);
      if (!result.ok) return result;

      // I-5: state は SafeClient のまま保持。clientRepository から password を引き直すダンスを廃止。
      // authService.loginSync 内で applyParentOptions 済みの SafeClient が返るので、そのまま使える。
      const effective: SafeClient = result.session.client;

      setClient(effective);
      loadClientData(effective);

      // ログ記録 (既存挙動踏襲)
      const dataId = resolveDataOwnerIdShared(effective);
      const operator = effective.accountType === 'parent'
        ? (effective.contactName || effective.companyName)
        : `${effective.companyName}${effective.baseName ? ' / ' + effective.baseName : ''}`;
      pushClientLog(dataId, {
        operator,
        category: 'auth',
        action: 'ログイン',
        target: effective.companyName,
      });
      return result;
    },
    [loadClientData]
  );

  const logout = useCallback(() => {
    if (client) {
      const dataId = resolveDataOwnerIdShared(client);
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
    // I-2b: sessionStorage 破棄を authService.logout に委譲。
    //  - LocalStorage 実装は body が同期処理 (this.clearSession) のため
    //    void で fire-and-forget しても microtask 待ちなしに sessionStorage が消える
    //  - 後続の setClient(null) によって [client] useEffect が再度 clearSession を呼ぶが冪等
    void authService.logout();
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
    const fresh = clientRepository.findById(client.id);
    if (!fresh) return;
    // I-5: state は SafeClient のため、最新 Client を SafeClient に剥がして親オプション継承を再適用。
    setClient(applyParentOptions(toSafeClient(fresh)));
  }, [client]);

  // 初期化: デモ用にデフォルトクライアントが無い場合は作成
  useEffect(() => {
    const clients = clientRepository.list();
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
      clientRepository.saveAll(updatedClients);
      clientDataRepository.save('demo', getDefaultClientData());
    }
  }, []);

  const value: AuthContextValue = {
    isLoggedIn: !!client,
    client,
    clientData,
    login,
    logout,
    reloadClientData,
    refreshClient,
    logAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
