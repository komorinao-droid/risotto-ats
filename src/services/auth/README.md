# AuthService 境界 (Phase I)

本ディレクトリは「クライアント (企業) アカウントの認証」を抽象化する境界。
Phase I-1 では型と LocalStorage 実装を追加するのみで、画面側 (AuthContext / Login / AccountSettings) は未連携。

> 運営 (admin) 側の認証は `src/admin/adminAuth.ts` で別管理 (SHA-256 + salt + token)。
> ここで扱うのは **クライアント (企業ユーザー) の認証** のみ。

## 目的

1. 本番認証実装 (Firebase Auth / 自前 API + HttpOnly Cookie / Google Identity 等) へ差し替えるための境界を先に確定させる
2. 画面コンポーネントから `Client.password` への直接アクセスを排除し、平文パスワードの露出面を `authService` 内に閉じ込める
3. AuthContext に混在している「認証 / セッション / データ読込 / オプション継承 / ログ」のうち、認証部分だけを切り出す

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `types.ts` | `SafeClient` / `AuthSession` / `LoginResult` / `ChangePasswordResult` / `AuthService` interface |
| `localAuth.ts` | `LocalStorageAuthService`: clientRepository ベースの実装。既存挙動と完全互換 |
| `index.ts` | `authService` シングルトン + 型 re-export |

## API (Phase I-1)

```ts
authService.login(id, password)
  → { ok: true, session: { client: SafeClient } }
  | { ok: false, reason: 'invalid_credentials' | 'inactive' }

authService.logout()
  → void  // sessionStorage から SafeClient を削除

authService.restoreSession()
  → AuthSession | null  // sessionStorage から復元 (リモート問合せなし)
                        // 旧フォーマット (password 入り) は SafeClient で書き直す

authService.refreshSession()
  → AuthSession | null  // clientRepository から最新化 + 親オプション継承再適用

authService.changePassword(currentPassword, newPassword)
  → { ok: true }
  | { ok: false, reason: 'not_logged_in' | 'invalid_current' | 'weak_new' }

authService.adminResetPassword(clientId, newPassword)              // Phase M-7a で追加 (運営者向け API)
  → { ok: true }
  | { ok: false, reason: 'not_found' | 'weak_new' }
```

すべて `Promise` を返す (Firebase / API 差し替え時の非同期前提に合わせるため)。
LocalStorage 実装は内部同期処理を `Promise.resolve` でラップしているだけ。

### `changePassword` と `adminResetPassword` の責務差

| API | 認証コンテキスト | 入力 | 用途 |
|---|---|---|---|
| `changePassword(currentPassword, newPassword)` | **ログイン中のセッションを持つクライアント本人** | 現在の password での再認証必須 | クライアント自身による自分の password 変更（AccountSettings） |
| `adminResetPassword(clientId, newPassword)` | **運営者** (admin) が任意の clientId を指定 | clientId 直指定（現在の password は問わない） | 運営画面 (AdminApp.handleUpdatePassword) からの強制リセット |

- `adminResetPassword` は対象クライアントの sessionStorage を**触らない**（運営者は自分のセッションではなく対象クライアントの password を変更するため）
- 弱パスワード判定は両 API とも `length < 6` で `weak_new` を返す（UI 側の入力フォーム制約と一致）
- LocalStorage 期の実装は `clientRepository.saveAll` で password 含む全件差し替え（`update` は password を strip するため saveAll 経由が必須）。これは Firebase Auth 移行時に Admin SDK の `auth.updateUser(uid, { password })` / Cloud Functions HTTP API に置換される

## SafeClient

```ts
export type SafeClient = Omit<Client, 'password'>;
```

- 画面側 / sessionStorage / state はすべて `SafeClient` を介する想定
- Phase I-1 時点では `Client.password` 自体は型から消していない (互換性のため)
- 平文パスワード残骸の除去は I-2 (AuthContext 連携) 以降で完了
- Phase M-7a で `adminResetPassword` を追加した時点でも本方針は維持: `adminResetPassword` は sessionStorage を触らない / SafeClient に password を出さない / 戻り値にも password を含めない。クライアント側 (ClientRepository) と運営側 (authService の管理者向け API) の双方が password を扱わない / 露出しない経路で統一されている

## 既存コードとの境界

| 既存コード | 状態 | I-1 での影響 |
| --- | --- | --- |
| `AuthContext.login` | clientRepository 直叩き | **影響なし** (未連携) |
| `AuthContext.logout` | sessionStorage 直操作 | **影響なし** (未連携) |
| `AuthContext` 復元 useEffect | sessionStorage を Client として読む | **影響なし** (未連携) |
| `Login.tsx` の inactive 判定 | storage.getClients() 直叩き | **影響なし** (未連携) |
| `AccountSettings.tsx` の changePassword | clients 配列を直接書換 | **影響なし** (未連携) |
| `clientRepository.findForLogin` | 平文照合 | **継続使用** (authService 内部から呼ぶ) |

## 本番認証への移行ルート (参考)

別エンジニアに本番認証を依頼する際の差し替え点は **このディレクトリの `index.ts` の 1 行**:

```ts
// 現状
export const authService = new LocalStorageAuthService();

// 例: Firebase Auth
export const authService = new FirebaseAuthService(firebaseApp);

// 例: 自前 API + HttpOnly Cookie
export const authService = new ApiCookieAuthService('/api/auth');
```

差し替え先実装が満たすべき契約は `types.ts` の `AuthService` interface のみ。
画面側のコードは `authService.login(...)` 等の呼出形だけ知っていれば良く、
内部が Firestore か REST か Cookie かを意識しない。

## 進捗 (Phase I)

- [x] **I-1**: AuthService 型 + LocalStorage 実装 (画面未連携)
- [x] **I-2a**: AuthContext の session restore / persist を authService 経由に + sessionStorage に password を残さない
- [x] **I-2b**: AuthContext.login / logout を authService.loginSync / logout 経由に (認証照合責務の移譲)
- [x] **I-3**: AccountSettings.changePassword を authService.changePassword 経由に (画面側から `client.password` 直参照を排除)
- [x] **I-4**: Login.tsx の `storage.getClients()` 直叩きを廃止し、AuthContext.login の戻り値を `boolean` → `LoginResult` に拡張して inactive / invalid_credentials を区別
- [x] **I-5**: AuthContext.client state を SafeClient 化 + `Client.password` を optional 化 ← Phase I 完了
  - state 型: `Client | null` → `SafeClient | null`
  - login 内の clientRepository.findById で password を引き直すダンスを廃止 (authService.loginSync の SafeClient をそのまま採用)
  - 親オプション継承を `applyParentOptions(safe)` ヘルパに切り出し
  - `Client.password` を `string` → `string?` に変更 (clientRepository / authService 内部だけが触る)
  - 画面側コードから `client.password` を読む経路は完全消滅 (admin 側のクライアント詳細表示は別経路で clientRepository から直接取得)

## 追加 API (Phase M-7a)

- [x] **M-7a**: AuthService に `adminResetPassword(clientId, newPassword)` を追加
  - 型: `AdminResetPasswordResult = { ok: true } | { ok: false; reason: 'not_found' | 'weak_new' }`
  - 用途: 運営者 (AdminApp) から任意のクライアントの password を強制リセット
  - LocalStorageAuthService 実装: 弱パスワード判定 (`length < 6` → `weak_new`) → `clientRepository.list()` から findIndex (`not_found` 判定) → 成功時は `clientRepository.saveAll(next)` で password 含む全件差し替え。sessionStorage は触らない (運営者は対象クライアントのセッションを持たない)
  - 既存の `changePassword` (セッション持ちクライアント本人による変更) と責務を分離。両 API の差は §API の「`changePassword` と `adminResetPassword` の責務差」表を参照
  - AdminApp.handleUpdatePassword は本 API 経由に置換済。旧 `saveAndReload` ヘルパは削除
  - ClientRepository は password を扱わない方針を維持 (`update` patch から型で除外 + 実行時 strip)。書込経路は authService の本 API 1 箇所に集約

## I-2a / I-2b 移行用 同期 shim

`AuthService` interface に以下 4 メソッドを transition shim として追加している:

- `restoreSessionSync()` — useState initializer の同期復元用
- `persistSession(client)` — `[client]` useEffect から sessionStorage 同期用 (内部で SafeClient に剥がす)
- `clearSession()` — logout 時の sessionStorage 破棄用
- `loginSync(id, password)` — AuthContext.login が boolean 同期返却するための認証 shim

これらは **本番認証 (Firebase / API + Cookie) への切替時に同期実装が成り立たないため、
no-op / throw 実装で interface を満たす予定**。AuthContext を完全 async 化した時点 (I-3 〜 以降) で削除候補。

## 次フェーズ (Firebase Auth 実装)

本番認証実装担当の作業順序・完了条件・本番リリース前チェックリストは **`docs/production-handoff-checklist.md`** に集約してある。本書では境界 (interface) と Phase I / M-7a の判断履歴を記録するに留める。Phase J-3 (`FirebaseAuthService` 実装) / J-4 (AuthContext async 化) の手順は handoff §4 を参照。

### Firebase Auth 移行時の API 別差し替え方針

| API | LocalStorage 期 | Firebase Auth 期 |
|---|---|---|
| `login / loginSync` | `clientRepository.findForLogin` で平文照合 | `signInWithEmailAndPassword` (Firebase Auth)。`loginSync` は throw で潰し、画面側を await 化 |
| `logout` | sessionStorage 破棄 | `signOut` + sessionStorage 破棄 |
| `restoreSession / restoreSessionSync` | sessionStorage から SafeClient 復元 | `onAuthStateChanged` で User 取得 → Firestore から SafeClient 取得。`restoreSessionSync` は throw |
| `refreshSession` | clientRepository から最新化 + 親オプション継承 | Firestore から最新化 + Custom Claims 再取得 (`getIdToken(true)`) |
| `changePassword` | 平文照合 + clientRepository.saveAll | Firebase Auth `reauthenticateWithCredential` → `updatePassword`。Firestore には password を書かない |
| **`adminResetPassword` (M-7a)** | `clientRepository.saveAll` で password 含む全件差し替え | **Firebase Auth Admin SDK の `auth.updateUser(uid, { password })`**、または Cloud Functions HTTP API 経由（クライアント側に Admin SDK を持たないため。Custom Claims `role: 'admin'` 保持者のみ呼出許可） |

`adminResetPassword` の Firebase Auth 実装では、`saveAll` 経路は完全消滅する (Firestore に password を書かないため)。本 API は AuthService 境界の中で完結しており、AdminApp.handleUpdatePassword 側は `authService.adminResetPassword(clientId, newPassword)` の呼出形式を変えずに切替可能。
