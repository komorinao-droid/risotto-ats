# 本番 DB / 認証 / ストレージ 実装担当 引き継ぎチェックリスト

> **対象**: 本番 Firestore / Firebase Auth / Cloud Storage を実装する別エンジニア
> **本書の役割**: コードに入る前に読む地図。完了済 / 未完了の範囲、推奨着手順、検証項目を 1 ファイルに集約する。
> **本書のスコープ外**: 実装そのもの、UI 変更、SMS / メール本送信、コスト試算

本書は `src/repositories/firestore-design.md` (v1.6) と `src/repositories/README.md` / `src/services/auth/README.md` の上位インデックスとして機能する。詳細はそれぞれの本書を参照。

---

## 0. 30 秒サマリ

- 画面コードは **Repository 層** (`src/repositories/`) と **AuthService 層** (`src/services/auth/`) を介してデータを読み書きする境界が確定済。
- Firestore / Firebase Auth / Cloud Storage への切替は、原則として **`src/repositories/index.ts` と `src/services/auth/index.ts` の各 1 行差し替え** + 新実装ディレクトリの追加でできる構成にしてある。
- Slot (Phase K) / Base (Phase L) / Client (Phase M) / 設定系 10 画面 (Phase N) は完了済。さらに整理タスク O-1 (baseScope.ts dead helper 削除) / O-3 (AddApplicantModal の `updateClientData` 撤去) / O-4 (AuthContext `updateClientData` shim 本体削除) / O-5 (baseScope.ts ファイル全体削除) も完了。**残る直書き経路**は **AdminApp の Client 以外 (AdminAccount / AdminLog / MediaIntegration、媒体連携、契約・請求等)** のみ。Firestore 化と同時に立ち上げると PR が肥大化するので、**段階順序を守ること**。
- ClientRepository は Phase M-1〜M-8 完了（型 + LocalStorage CRUD 5 API + AccountSettings + BaseRepository + AdminApp 全 callsite + `clientOptions.incrementOptionUsage` + BaseManagement read-only 経路）。**クライアント系 `storage.getClients/saveClients` 直叩きはコードベースから完全消滅**。
- Phase N-1〜N-10 で設定系 10 画面（Job / Source / EmailTemplate / Hearing / ReportSchedule / Exclusion / MediaCost / FilterCondition / Screening / Chatbot）が Repository 経由化済。さらに O-3 で `AddApplicantModal.tsx` の最後の `updateClientData` 実 callsite も `applicantRepository.markDuplicateByMatch` 経由化済。O-4 で `AuthContext.updateClientData` shim 本体（interface / useCallback / context value）を完全撤去。**`updateClientData` のコード実装はコードベース全体で 0 件**（docs / JSDoc / inline コメントの historical mention のみ残置）。
- `src/repositories/firestore-design.md` (v1.6) が本番 DB 設計の唯一のソース。本書はその「実装着手側から見た作業順序」だけを抽出する。

---

## 1. Claude 側で完了済の範囲 (移行時の安全領域)

### 1.1 Repository 層 (LocalStorage 実装 + 型定義)

| Repository | 完了範囲 | 主要 API |
|---|---|---|
| `clientRepository` | 読み取り + saveAll + CRUD 5 API (Phase M-1〜M-8 完了。クライアント系 storage 直叩きは全消滅。`saveAll` は authService.adminResetPassword 内部のみが利用) | `list / findById / findForLogin / saveAll / create / update / delete / listChildren / detachChildBaseName` |
| `clientDataRepository` | god-object の get/save/delete | `get / save / delete` |
| `applicantRepository` | フル CRUD + 一括操作 + cascade delete + duplicate flag マーキング | `list / get / create(opts) / update / changeStage / changeStageBulk / clearStageForDeletedStatus / markDuplicateByMatch / delete` |
| `statusRepository` | CRUD + 並び替え + サブステータス | `list / save / upsert / remove / toggleActive / moveOrder / addSubStatus / removeSubStatus` |
| `eventRepository` | CRUD + 複合書込 (Phase H 完了) | `listByApplicant / listByDateRange / create / remove / removeWithCancelRecord / scheduleInterview` |
| `slotRepository` | 拠点 × 日付 × 時刻の 3 階層枠数管理 (Phase K-1〜K-4 完了) | `listBase / getDay / getCapacity / setCapacity / bulkSetCapacity / removeBase` |
| `baseRepository` | 拠点 CRUD + 8 配列カスケード削除 + child アカウント baseName クリア (Phase L-1〜L-3 完了) | `list / get / findByName / create / update / deleteWithCascade` |
| `messageRepository` | 統合連絡ログ (土台のみ) | `listByApplicant / create / updateStatus / listRecent` |
| `reportRepository` | 採用目標のみ | `getRecruitmentGoals / updateRecruitmentGoal` |

**インターフェースは `src/repositories/types.ts` に集約済**。Firestore 実装はこのインターフェースを満たすクラスを `src/repositories/firestore/` 配下に追加するだけで切替可能。

### 1.2 AuthService 層

| 範囲 | 完了内容 |
|---|---|
| 認証境界 | `src/services/auth/` に集約。`authService.login / logout / restoreSession / refreshSession / changePassword` |
| SafeClient 化 | 画面 state は `SafeClient = Omit<Client, 'password'>`。sessionStorage に password を残さない |
| 戻り値型 | `LoginResult = { ok: true, session } \| { ok: false, reason: 'invalid_credentials' \| 'inactive' }` |
| Client.password optional 化 | 型定義側で optional。画面コードから `client.password` 直参照は完全消滅 |
| 同期 shim | `loginSync / restoreSessionSync / persistSession / clearSession`。Firebase Auth 実装では `throw` で潰す前提 |

詳細: `src/services/auth/README.md`。

### 1.3 ApplicantDetail / Calendar の Repository 化

| 経路 | Phase | 状態 |
|---|---|---|
| ApplicantDetail.updateApplicant (10 callsite) | G-1 | ✅ |
| ApplicantDetail.handleDelete (events / exclusionList カスケード) | G-2 | ✅ |
| Calendar.handleBook / handleCancelEvent | H-2 | ✅ |
| ApplicantDetail.handleReschedule | H-3 | ✅ |
| ApplicantDetail.handleCancelEvent (cancelledInterviews append 含む) | H-4 | ✅ |
| ApplicantDetail.handleScheduled (events 追加 + stage='面接確定' 同時) | H-5 | ✅ |
| SlotRepository 型 + LocalStorage 実装 (画面未連携) | K-1 | ✅ |
| Calendar.setSlotCapacity → slotRepository.setCapacity | K-2 | ✅ |
| Calendar.bulkSetAllSlots → slotRepository.bulkSetCapacity | K-3 | ✅ |
| Calendar.handleBulkApply → slotRepository.bulkSetCapacity (Calendar.tsx の slotSettings 直書き経路完全消滅) | K-4 | ✅ |
| BaseRepository 型 + LocalStorage 実装 (画面未連携) | L-1 | ✅ |
| BaseManagement.save / Calendar.saveBaseSettings → baseRepository.create / update | L-2 | ✅ |
| BaseManagement.deleteBase → baseRepository.deleteWithCascade (8 配列 + child baseName cascade を集約。K-5 を同時消化) | L-3 | ✅ |
| ClientRepository に CRUD 5 API 追加 (create / update / delete / listChildren / detachChildBaseName。型 + LocalStorage、画面未連携) | M-1 | ✅ |
| AccountSettings の会社情報保存 / メンバー追加・削除・通知 toggle を clientRepository.findById + update 経由に (4 callsite、storage 直叩き消滅) | M-2 | ✅ |
| baseRepository.deleteWithCascade の child baseName クリアを clientRepository.detachChildBaseName 経由に (baseRepository から storage.getClients/saveClients 直叩き消滅) | M-3 | ✅ |
| AdminApp.loadClients を clientRepository.list() 経由に (運営画面初期読込から storage.getClients 直叩き除去) | M-4 | ✅ |
| AdminApp.handleToggleStatus / onUpdateClient prop 内部を clientRepository.findById/update/list 経由に (prop シグネチャは維持) | M-5a | ✅ |
| AdminApp.handleSave を clientRepository.create/update 経由に (親 companyName 変更時の child companyName 追従は listChildren + update で維持。password は update で strip) | M-5b | ✅ |
| AdminApp.handleDelete を clientRepository.delete 経由に (parent → child cascade を Repository 内に集約。clientData / operationLogs キー削除は AdminApp orchestration として呼出側に維持) | M-6 | ✅ |
| AuthService に adminResetPassword 追加 + LocalStorageAuthService 実装 + AdminApp.handleUpdatePassword を authService.adminResetPassword 経由に (ClientRepository は password を扱わない方針維持。sessionStorage / SafeClient に password を出さない) | M-7a | ✅ |
| `src/utils/clientOptions.ts` の incrementOptionUsage を clientRepository.findById/update 経由に (storage.getClients/saveClients 直叩き除去) | M-7b | ✅ |
| BaseManagement の削除確認用 child 件数取得を clientRepository.listChildren 経由に (BaseManagement.tsx 内の storage 直叩き消滅) | M-8 | ✅ |

### 1.4 Firestore 設計書

| ファイル | バージョン | カバー範囲 |
|---|---|---|
| `src/repositories/firestore-design.md` | v1.6 | Collection 設計 / Index / Transaction 候補 / 残 Repository / Tenant 分離 / Migration / Security Rules / Cloud Storage / 引継メモ |

設計書の各章はそのまま実装作業の章立てに対応する。

### 1.5 既存 Repository / Phase の参照表

| Phase | 内容 |
|---|---|
| A | applicantRepository.changeStage で reason 付与経路完成 |
| B | ExclusionList 経由の changeStageBulk |
| C | clearStageForDeletedStatus + StatusManagement.deleteStatus 移行 |
| D | StatusRepository 立ち上げ + StatusManagement.tsx 移行 |
| E | Repository 非同期化方針ドキュメント (`README.md`) |
| F | applicantRepository.create に initialStageReason / CSV import 連携 |
| G | applicantRepository.update / delete (cascade) を ApplicantDetail に集約 |
| H | EventRepository 立ち上げ + Calendar / ApplicantDetail 全経路移行 |
| I | AuthService 境界 + SafeClient 化 + Client.password optional 化 |
| K | SlotRepository 立ち上げ + Calendar.tsx の slotSettings 直書き経路を全 Repository 化 (K-1〜K-4)。K-5 = BaseManagement.deleteBase 連携は Phase L-3 で集約 |
| L | BaseRepository 立ち上げ (L-1) + BaseManagement / Calendar の bases 直書き経路を全 Repository 化 (L-2)。L-3 で `deleteWithCascade` に 8 配列カスケード + child アカウント baseName クリアを集約 (K-5 を同時消化) |
| M | ClientRepository CRUD 補完: 5 API 追加 (M-1) / AccountSettings (M-2) / BaseRepository 経由置換 (M-3) / AdminApp.loadClients (M-4) / AdminApp.handleToggleStatus + onUpdateClient prop (M-5a) / AdminApp.handleSave (M-5b、child companyName 追従を listChildren + update で維持) / AdminApp.handleDelete (M-6、clientData/operationLogs は orchestrator 残置) / AuthService.adminResetPassword 追加 + AdminApp.handleUpdatePassword (M-7a) / clientOptions.incrementOptionUsage (M-7b) / BaseManagement read-only 経路 (M-8)。**クライアント系 `storage.getClients/saveClients` 直叩きはコードベースから完全消滅** |
| N | 設定系 10 画面の Repository 化: JobManagement (N-1) / SourceManagement (N-2) / EmailTemplateManagement (N-3) / HearingManagement (N-4) / ReportScheduleSettings (N-5、reportRepository 拡張) / ExclusionList (N-6) / MediaCostManagement (N-7) / FilterConditionSettings (N-8) / ScreeningSettings (N-9) / ChatbotManagement (N-10)。`useAuth` 分割代入から `updateClientData` を除去 → `reloadClientData` に統一。base-override / cascade / deep copy 方針は `README.md §14` の各 N-x 節を参照。**設定画面側の `updateClientData` 直叩きはコードベースから完全消滅**。後続整理として O-1 で `baseScope.ts` の dead 6 helper 削除、O-3 で `AddApplicantModal.tsx` の `updateClientData` 撤去 (`applicantRepository.markDuplicateByMatch` 経由化)、O-4 で `AuthContext.updateClientData` shim 本体（interface / useCallback / context value）を完全撤去、O-5 で `baseScope.ts` ファイル自体を削除（`resolveJobs` / `resolveSources` の 2 callsite を inline 解決に置換、JobManagement.tsx と同じパターン） |

---

## 2. 未完了の範囲 (実装担当の作業対象)

### 2.1 本体実装

| 項目 | 概要 | 優先度 |
|---|---|---|
| **Firestore 実装** | `src/repositories/firestore/` 配下に各 Repository の Firestore 版を新設 | ★★★ |
| **Firebase Auth 実装** | `src/services/auth/firebase/` に `FirebaseAuthService` 新設。同期 shim は throw | ★★★ |
| **Cloud Storage 添付ファイル実装** | `Applicant.files[]` の inline url を Cloud Storage path に置換。Storage Rules 整備 | ★★★ |

### 2.2 設定系 Repository (✅ Phase N-1〜N-10 完了)

設定系 10 画面の Repository 化は完了済。Firestore 移行時は LocalStorage 実装と同じインターフェース（`src/repositories/types.ts`）を満たす Firestore 版を `src/repositories/firestore/` に追加するだけで切替可能。

| Repository | 画面 | LocalStorage 実装 | Phase |
|---|---|---|---|
| `jobRepository` | `JobManagement.tsx` の `jobs / jobsByBase` | ✅ | N-1 |
| `sourceRepository` | `SourceManagement.tsx` の `sources / sourcesByBase`（password 暗号化は Firestore 化時に検討）| ✅ | N-2 |
| `emailTemplateRepository` | `EmailTemplateManagement.tsx` の `emailTemplates / emailTemplatesByBase` | ✅ | N-3 |
| `hearingRepository` | `HearingManagement.tsx` の `hearingTemplates` | ✅ | N-4 |
| `reportRepository` (拡張) | `ReportScheduleSettings.tsx` の `reportSchedule` | ✅ | N-5 |
| `exclusionRepository` | `ExclusionList.tsx` の `exclusionList`（add + changeStageBulk の 2 段呼出は Firestore 化時に 1 transaction 化を検討）| ✅ | N-6 |
| `mediaCostRepository` | `MediaCostManagement.tsx` の `mediaCosts[ym][source]` | ✅ | N-7 |
| `filterConditionRepository` | `FilterConditionSettings.tsx` の `filterCondition / filterConditions[base]` | ✅ | N-8 |
| `screeningRepository` | `ScreeningSettings.tsx` の `screeningCriteria` (axes / byJob 含む) | ✅ | N-9 |
| `chatbotRepository` | `ChatbotManagement.tsx` の `chatScenarios / chatQuestionGroups / chatLeadSettings` (3 配列管理) | ✅ | N-10 |

詳細設計（API 契約・base-override・cascade・deep copy 方針・Firestore マッピング案）は `src/repositories/README.md §14` の各 N-x 節と `src/repositories/firestore-design.md §5.3` を参照。

### 2.3 AdminApp 系 (運営画面、Client 以外)

| 項目 | 担当範囲 | 優先度 |
|---|---|---|
| **AdminAccountRepository** | `risotto:admin:accounts` → Firebase Auth + `/admins/{id}` | ★★ |
| **AdminLogRepository** | `risotto:admin:operation_logs` → `/admins/{aid}/operationLogs/{lid}`。hash chain は Cloud Functions | ★★ |
| **MediaIntegrationRepository** | `risotto:admin:media` → `/admin/mediaIntegrations/{mid}`。apiKey は KMS / Secret Manager | ★★ |
| **契約 / 請求 / 解約管理系の AdminApp callsite** | CancellationSection / 請求 / 契約変更等、AdminApp 内の Client 以外の状態を扱う領域。Phase M では ClientRepository 経由化のみで足りるが、専用 Repository / Service への切出は別途検討 | ★ |
| **テナント間データ移管 API** | localStorage 直読み経路を Cloud Functions 専用 API に分離 | ★ |

> **ClientRepository は Phase M-1〜M-8 で完了済**。AdminApp の loadClients / handleSave / handleDelete / handleToggleStatus / handleUpdatePassword / onUpdateClient prop + `clientOptions.incrementOptionUsage` + BaseManagement の child 件数取得はすべて Repository / authService 経由に置換済で、クライアント系 storage 直叩きは 0 件。

### 2.4 Phase N 完了後の整理タスク

Phase N 完了で設定 10 画面の Repository 化は揃った。O-4 で `AuthContext.updateClientData` shim、O-5 で `baseScope.ts` ファイル自体も撤去済。残るは AdminApp 系の整理のみ。Firestore 化（Phase J）と独立して進めて良い。

| ID | 内容 | 概要 | 優先度 |
|---|---|---|---|
| **O-1** | `baseScope.ts` dead helper 削除 | ✅ 完了（`resolveScreeningCriteria` / `hasScreeningJobOverride` / `resolveEmailTemplates` / `hasJobsOverride` / `hasSourcesOverride` / `hasEmailTemplatesOverride` を削除）| — |
| **O-2** | docs 更新 | ✅ 完了（本書 / `firestore-design.md` §5 / §5.3 を Phase N 完了状態に書き換え）| — |
| **O-3** | `AddApplicantModal.tsx` の `updateClientData` 撤去 | ✅ 完了（duplicate flag 一括更新を `applicantRepository.markDuplicateByMatch(ownerId, { name, phone }, { baseName: childBase ?? null })` 経由に置換。`scope.baseName` で子アカウントの自拠点境界を Repository 側に再現。既に `duplicate === true` は skip / markedCount 0 で save なし / `withUpdatedMeta` 付与なし）| — |
| **O-4** | `AuthContext.updateClientData` shim 削除 | ✅ 完了（`AuthContextValue` interface / `useCallback` 実装 / `AuthContext.Provider value` の 3 箇所から削除。`filterDataByBase` / `loadClientData` / `reloadClientData` は維持。`updateClientData` のコード経路はコードベースから完全消滅、docs / JSDoc / inline コメントの historical mention のみ残置）| — |
| **O-5** | `baseScope.ts` 全体削除 | ✅ 完了（`AddApplicantModal.tsx` / `ApplicantDetail.tsx` の 2 callsite を inline 解決 `clientData.jobsByBase?.[baseName] ?? clientData.jobs` に置換し、`src/utils/baseScope.ts` ファイル自体を削除。`JobManagement.tsx:55-61` と同じ既存パターン。新規 Repository API は追加せず、`jobRepository.list` / `sourceRepository.list` の利用も見送り — Firestore 化フェーズで render path 全体を async 書き換える際に Repository 経由化を一斉適用する方針）| — |
| **O-6** | AdminApp の `storage.getClientData / saveClientData` 直叩き整理 | 運営画面 invoice / clientData 直叩き（AdminApp.tsx で 10 callsite）を専用 Repository 経由に。Phase N スコープ外として残存 | ★ |

### 2.5 E2E / Migration ツール

| 項目 | 概要 | 優先度 |
|---|---|---|
| **クライアント側 Export 機能** | AdminApp に「全データ JSON エクスポート」追加。各テナントごとに 1 ファイル | ★★★ |
| **サーバ側 Import ツール** | Cloud Functions / Admin SDK CLI。設計書 §7.1.2 の変換表に従う | ★★★ |
| **Firebase Auth ユーザー登録移行** | パスワードリセットメール送信 or 仮パスワード初回変更 | ★★★ |
| **データ整合性チェックスクリプト** | 件数突合 / orphan 検出 / stageHistory monotonicity / Storage 添付実在性 | ★★ |
| **dual-write モード (hybrid 運用)** | Firestore + LocalStorage 両方書き、移行検証期間後に LocalStorage 切る | ★★ |
| **Cloud Scheduler バッチ** | `dataRetentionUntil` 自動削除 / `cancellationDate` 到来時 inactive 化 | ★ |

---

## 3. 実装担当が最初に読むべきファイル (順序付き)

| 順 | ファイル | 読む目的 |
|---|---|---|
| 1 | **本書 (`docs/production-handoff-checklist.md`)** | 全体像・作業順 |
| 2 | **`src/repositories/firestore-design.md`** | Collection / Index / Transaction / Migration / Security Rules / Cloud Storage の設計案 |
| 3 | **`src/repositories/README.md`** | Repository 段階移行方針、画面 1 つずつ async 化のルール、transaction 候補一覧 |
| 4 | **`src/repositories/types.ts`** | 全 Repository インターフェース定義。Firestore 実装が満たすべき契約 |
| 5 | **`src/services/auth/README.md`** | AuthService 境界、SafeClient、本番認証への切替手順 |
| 6 | **`src/services/auth/types.ts`** | AuthService インターフェース |
| 7 | **`src/types/index.ts`** | データ型定義の正本 (`Applicant / ClientData / Client / InterviewEvent / SlotSetting / FileAttachment` 等) |
| 8 | **`src/repositories/localStorage/*.ts`** | 既存 LocalStorage 実装 (Firestore 実装のロジック踏襲の参考) |
| 9 | **`src/utils/applicantLifecycle.ts`** | `withStageChange / withCreatedMeta / withUpdatedMeta` の純関数群 |
| 10 | **`src/contexts/AuthContext.tsx`** | 画面側がどう Repository / AuthService を呼んでいるかの実例 |

> **注**: 本書 → 設計書 → README → types の順で 60〜90 分程度を見込む。実装着手前に必ず通読すること。

---

## 4. 推奨 PR 順 (実装フェーズ)

各 PR は **既存の LocalStorage 経路を壊さない** ことを最優先。`src/repositories/index.ts` の差し替え行を最後の PR まで触らない。

### Phase J-1: Firebase 基盤セットアップ (PR 1)

- Firebase project (dev / staging / prod) 作成
- Firestore / Auth / Storage 有効化
- `firebase.json` / `firestore.rules` / `firestore.indexes.json` / `storage.rules` のスケルトンをコミット
- Firebase Emulator Suite を CI に組み込み
- `src/repositories/firestore/` / `src/services/auth/firebase/` ディレクトリだけ作成 (空ファイル)

**検証**: Emulator 起動 / build 成功 / 既存挙動に影響なし

### Phase J-2: Firestore Repository 実装 (画面未連携, PR 2 〜 7)

設計書 §10.2 の着手順に従う。**1 PR = 1 Repository** が目安。

| PR | 内容 |
|---|---|
| 2 | `FirestoreClientRepository` + `FirestoreClientDataRepository` (空実装でも可) |
| 3 | `FirestoreApplicantRepository` (changeStage / changeStageBulk / clearStageForDeletedStatus / delete 含む) |
| 4 | `FirestoreEventRepository` (scheduleInterview / removeWithCancelRecord 含む) |
| 5 | `FirestoreMessageRepository` |
| 6 | `FirestoreStatusRepository` |
| 7 | `FirestoreReportRepository` |

**検証**: emulator + 単体テストで既存 LocalStorage 実装と挙動同等性を確認 (戻り値・副作用)

### Phase J-3: AuthService Firebase 実装 (PR 8)

- `FirebaseAuthService` 新設、`AuthService` interface を満たす
- 同期 shim (`loginSync / restoreSessionSync / persistSession / clearSession`) は **`throw new Error(...)`** で即時失敗
- AuthContext を async 化する PR を分離 (PR 9)

### Phase J-4: AuthContext async 化 (PR 9)

- `AuthContext.login` を `await authService.login(...)` に変更
- `useEffect` の `restoreSessionSync` 利用を `useEffect(async () => { await restoreSession() }, [])` に
- loading / error state を導入

### Phase J-5: 残 Repository (Base / Slot / 設定系) を Firestore で立ち上げ (PR 10 〜 N)

設計書 §5 の優先度順:

1. **BaseRepository** (Phase L で完了済 — `firestore-design.md §5.2` / `repositories/README.md §12`)。Firestore 実装は `tenants/{tid}/bases/{baseId}` doc + `slots/{date}` subcollection。8 配列カスケードは Cloud Functions 経由が現実的 (500 doc transaction 上限超のリスク)。`computeRemoveBasePatch` は LocalStorage 限定の pure helper のため Firestore 実装では不要
2. **SlotRepository** (Phase K で完了済 — `firestore-design.md §5.1` / `repositories/README.md §11`)。Firestore 実装は `tenants/{tid}/bases/{baseId}/slots/{date}` の `capacities` map field + WriteBatch を date 単位でグルーピング
3. **ClientRepository** (Phase M-1〜M-8 で完了済 — `firestore-design.md §5.4.1` / `repositories/README.md §13`)。Firestore 実装は `tenants/{tid}` doc + `tenants/{tid}/accounts/{accountId}` subcollection。password は Firebase Auth 側、`clientData / operationLogs` の delete は Cloud Functions の subcollection 再帰削除 or `tenants/{tid}` doc delete トリガに移管。`saveAll` 経由の `adminResetPassword` は Firebase Auth Admin SDK / Cloud Functions に置換し同時撤去
4. 設定系 (Job / Source / EmailTemplate / Hearing / FilterCondition / Screening / Chatbot / MediaCost / ReportSchedule / Exclusion)
5. AdminApp 系 (AdminAccount / AdminLog / MediaIntegration)

各 Repository を立ち上げる PR と、画面側を Repository 経由に置換する PR は分けると小さく回せる。

### Phase J-6: Cloud Functions 整備 (PR 並行)

- operationLogs / messageLogs / smsLogs ほかログ系の **append-only Cloud Functions API**
- hash chain 計算 (FNV-1a 移植)
- BaseManagement.deleteBase の 8 配列 cascade を Cloud Functions に分離
- `dataRetentionUntil` / `cancellationDate` Scheduled batch
- Anthropic API 呼び出し (apiCallLogs 生成)

### Phase J-7: Cloud Storage 添付実装 (PR)

- `tenants/{tid}/applicants/{aid}/files/{fileId}` doc + `gs://risotto-files/tenants/{tid}/applicants/{aid}/{fileId}_xxx`
- 画面側のアップロード/ダウンロード経路を `getDownloadURL` に変更
- Storage Rules 整備 (設計書 §9.3)

### Phase J-8: Migration ツール + Hybrid 期間 (PR)

- AdminApp に Export 機能追加
- Import CLI (Admin SDK)
- Firebase Auth ユーザー一括登録 (パスワードリセットメール)
- dual-write モード切替フラグ
- 整合性チェックスクリプト

### Phase J-9: 切替 (PR)

- `src/repositories/index.ts` の各シングルトンを Firestore 版に切替
- `src/services/auth/index.ts` を `FirebaseAuthService` に切替
- LocalStorage 廃棄 (移行検証期間 1〜2 週間後)

---

## 5. Transaction / Cloud Functions 必須候補

詳細は `firestore-design.md §4` 参照。**実装時は勝手に増やさない / 減らさない**。

### 5.1 必須 Transaction (runTransaction)

| 操作 | 理由 |
|---|---|
| `eventRepository.scheduleInterview` | events 追加 + applicant.stage 更新の 2 doc 操作 |
| `eventRepository.removeWithCancelRecord` | events 削除 + applicant.cancelledInterviews 追加 |
| `applicantRepository.changeStageBulk` | 複数 applicant の同時更新 (500 doc 超は WriteBatch chunk + Cloud Functions) |
| `applicantRepository.clearStageForDeletedStatus` | 全 applicants の stage / stageHistory 掃除 |
| `applicantRepository.delete` | applicants / events / exclusionList の 3 collection cascade |
| `exclusionList.addEntry` | exclusionList 追加 + matched applicants 一括除外 (現状 2 段 save の 1 transaction 化) |
| `statusRepository.removeWithCascade` (新設候補) | statuses 削除 + applicants stage クリア |
| `baseRepository.deleteWithCascade` | 8 配列 cascade。500 doc 超は Cloud Functions 経由 |
| `authService.changePassword` | Firebase Auth update + tenant.sessionInvalidatedAt 更新 |
| **child の baseName 変更** | accounts doc 更新 + Custom Claims 更新 (Cloud Functions で順次 + idempotent) |

### 5.2 Batch Write (transaction 不要)

- CSV インポート (createMany 未実装)
- ログ系の append (messageLogs / smsLogs / operationLogs)
- 設定系の一括保存
- AdminAccount のロックアウト更新 (`failedAttempts++` / `lockedUntil`)
- `incrementOptionUsage` (`FieldValue.increment(1)`)

### 5.3 Cloud Functions 経由必須

- `BaseManagement.deleteBase` の 8 配列 cascade (500 doc 超のリスク)
- `Client.cancellationDate` 到来時の auto-inactive 化 (Cloud Scheduler)
- `Applicant.dataRetentionUntil` 経過時のバッチ削除 (Cloud Scheduler)
- operation logs / admin operation logs の append (hash chain 計算)
- Anthropic API 呼び出し (API key を client に置かない)
- Custom Claims 付与 / 更新 (Firebase Auth Admin SDK 必須)

---

## 6. Security Rules / Custom Claims の注意

詳細は `firestore-design.md §6 / §8` 参照。

### 6.1 Custom Claims 設計

```ts
// Firebase Auth User custom claims
{
  tenantId: string,        // = parent.id
  accountType: 'parent' | 'child' | 'admin',
  baseName?: string,       // child のみ
  accountId: string,       // tenants/{tid}/accounts/{accountId}
  role?: 'admin',          // admin のみ
}
```

### 6.2 Rules 重要ポイント

| ポイント | 理由 |
|---|---|
| **child の baseName 越え書込禁止** | 画面側 + Rules の **多重防御**。どちらか片方にしない |
| **stageHistory の update / delete を admin 以外禁止** | 監査保持 |
| **operationLogs / messageLogs ほかログ系の write を Cloud Functions 経由に** | hash chain と TTL を server side で強制 |
| **password / passwordHash / apiKey は Firestore に書かない** | Firebase Auth / Cloud KMS / Secret Manager で管理 |
| **accounts doc の自分自身 update のみ許可** | 自分のメール / 電話番号変更は許可、他人のは parent のみ |
| **baseOverrides は parent のみ書込可** | child は自拠点読取のみ |
| **monthlyStats は client 直接書込禁止** | 集計は Cloud Functions 経由のみ |
| **Custom Claims は Firebase Auth Admin SDK でのみ付与** | 一般ユーザーが claim を自前発行できないように |

### 6.3 Custom Claims セット手順 (要決定)

実装着手前にプロダクトオーナーと合意:

- 案 A: 管理画面 (parent) からの child 登録 → Cloud Functions HTTP API で `auth.setCustomUserClaims`
- 案 B: Firebase Auth `onCreate` トリガで `accounts/{aid}` を読み、claim を後付け
- claim 変更後は client 側で `getIdToken(true)` を呼び即時反映

---

## 7. Migration 手順の概要

詳細は `firestore-design.md §7` 参照。

### 7.1 4 ステップ

1. **AdminApp に Export 機能追加** — 各テナントごとに `Client[]` + `ClientData` + `ClientOperationLog[]` を 1 JSON ファイルに固める
2. **サーバ側 Import ツール** — Cloud Functions / Admin SDK CLI で受領 JSON を Firestore に流し込む。設計書 §7.1.2 の変換表に従う
3. **Firebase Auth ユーザー登録** — 全ユーザーにパスワードリセットメール送信 (推奨) or 仮パスワード初回変更
4. **Hybrid 期間 (1〜2 週間)** — dual-write モードで Firestore + LocalStorage に同時書き込み → 検証後 LocalStorage 廃棄

### 7.2 ID 型変更 (number → string)

- `Applicant.id / InterviewEvent.id / ExclusionEntry.id / Status.id / Source.id / Base.id / Job.id / Member.id / EmailTemplate.id` が number → string
- 推奨: 型を `string` に統一する PR を Firestore 実装前に分離して投入。`a.id === id` 比較を `String(a.id) === id` で吸収

### 7.3 Timestamp 正規化

- LocalStorage の `cancelledAt: '2026/04/30 14:30'` 形式は移行時にパース失敗のリスクあり → ISO 化必須
- Firestore は `Timestamp` 型に統一

### 7.4 ファイル添付

- `Applicant.files[].url` (base64 / dataURL / プレースホルダ) を読む
- base64 decode → Cloud Storage put → `storagePath` を取得
- Firestore 側 metadata doc に `storagePath` を保存

---

## 8. LocalStorage → Firestore 移行時の検証チェック

整合性チェックスクリプトで以下を全件突合する:

### 8.1 件数突合

- [ ] `clients[]` の件数 = `/tenants/` 配下の doc 数
- [ ] 各テナントの `applicants[]` 件数 = `/tenants/{tid}/applicants/` doc 数
- [ ] 各テナントの `events[]` 件数 = `/tenants/{tid}/events/` doc 数
- [ ] 各テナントの `messageLogs[] / smsLogs[] / emailLogs[] / webhookLogs[] / apiCallLogs[] / invoices[]` 件数 = 各 collection の doc 数
- [ ] 各テナントの `exclusionList[]` 件数 = `/tenants/{tid}/exclusionList/` doc 数
- [ ] 各テナントの `bases[] / jobs[] / sources[] / statuses[] / emailTemplates[] / hearingTemplates[] / chatScenarios[] / chatQuestionGroups[] / chatLeadSettings[]` 件数 = 各 collection の doc 数

### 8.2 Orphan / 整合性

- [ ] `applicant.stage` の値が `statuses` 配列に存在 (削除済 status を指してないか)
- [ ] `applicant.subStatus` が親 stage の `subStatuses` に存在
- [ ] `event.applicantId` が存在する applicant を指している
- [ ] `event.base` が存在する `bases` を指している
- [ ] `exclusionList[].applicantId` が存在する applicant を指している (null の場合は許容)
- [ ] `applicant.files[].storagePath` が Cloud Storage に実在する
- [ ] `applicant.base` が存在する `bases` を指している (空文字は許容)
- [ ] child accounts の `baseName` が存在する `bases` を指している

### 8.3 stageHistory

- [ ] `stageHistory[].changedAt` が時系列昇順 (monotonic)
- [ ] `stageHistory[].toStage` と最終 entry の `applicant.stage` が一致
- [ ] `stageHistory[].operator / reason` が必須項目を満たす (移行データには許容範囲を決める)

### 8.4 Custom Claims

- [ ] 全 Firebase Auth User に `tenantId / accountType / accountId` claim が付与されている
- [ ] child の `baseName` claim が `accounts` doc の `baseName` と一致する
- [ ] admin に `role: 'admin'` claim が付与されている

### 8.5 Rules

- [ ] Firebase Emulator + テストスイートで以下を確認:
  - parent: 自テナント全体に read/write 可
  - child: 自拠点 applicant / event のみ read/write 可、他拠点は denied
  - child: 設定系 collection に write すると denied
  - admin: 全テナント read/write 可
  - 未認証: 全 denied

### 8.6 Migration 後 1 週間チェック

- [ ] エラーログ (Cloud Logging) に Permission denied が出ていないか
- [ ] パスワードリセットメール完了率 (未完了ユーザー catch up)
- [ ] dual-write モード中の書込差分 (LocalStorage と Firestore の diff)
- [ ] Firestore 読み取り QPS / コスト試算からの逸脱

---

## 9. 本番リリース前チェックリスト

### 9.1 機能確認 (E2E)

- [ ] ログイン / ログアウト / セッション復元 (F5 / 別タブ)
- [ ] パスワード変更 → 旧パスワードで login 失敗 / 新パスワードで成功
- [ ] 応募者作成 / 編集 / 削除 (events / exclusionList cascade)
- [ ] CSV インポート (initialStageReason 付き / 無し)
- [ ] ステージ変更 (single + bulk + 除外リスト経由)
- [ ] 面接予約 (Calendar / ApplicantDetail) → stage='面接確定' 反映
- [ ] 面接キャンセル (cancelledInterviews 履歴 + 面接削除)
- [ ] 面接日時変更 (handleReschedule → ScheduleInterviewModal)
- [ ] ステータス削除 → applicants の stage クリア
- [ ] 拠点削除 → 8 配列カスケード (BaseRepository 完了後)
- [ ] 採用レポート月次出力 (CSV / PDF / Excel)
- [ ] AI スクリーニング 1 件実行 → apiCallLogs 記録
- [ ] 添付ファイルアップロード / ダウンロード (Cloud Storage)
- [ ] 子アカウント login → 自拠点のみ表示される
- [ ] 子アカウント login → 設定画面アクセス禁止 (UI 側 + Rules)
- [ ] 運営アカウント login → 全テナント横断アクセス可

### 9.2 Security Rules

- [ ] Firebase Emulator のテストスイート全 pass
- [ ] Custom Claims が無いトークンで Firestore 操作不可
- [ ] child が他拠点 applicant に直接 query しても denied

### 9.3 Cloud Functions

- [ ] operationLogs / messageLogs の append が Cloud Functions 経由のみ
- [ ] hash chain 計算が想定通り動く (改竄検知テスト)
- [ ] `dataRetentionUntil` バッチが想定日付で削除
- [ ] `cancellationDate` 到来時に auto-inactive

### 9.4 Migration

- [ ] 全テナントの整合性チェック (§8) pass
- [ ] パスワードリセット完了率 100% (未完了ユーザー個別フォロー)
- [ ] hybrid 期間中に Firestore / LocalStorage 差分なし
- [ ] LocalStorage 廃棄前にバックアップ取得

### 9.5 監視 / 運用

- [ ] Cloud Logging に Permission denied のアラート設定
- [ ] Firestore コスト試算からの逸脱アラート
- [ ] Cloud Functions エラー率アラート
- [ ] Cloud Storage 容量アラート
- [ ] Sentry / Crashlytics で client 側エラー収集

### 9.5.1 性能 / 信頼性 (PM/SRE と合意した上で着手)

- [ ] 負荷試験: 想定 QPS で applicants list / changeStageBulk / scheduleInterview のレスポンス時間測定
- [ ] Firestore バックアップ戦略: PITR (Point-in-Time Recovery) 有効化 + scheduled export to GCS の頻度決定
- [ ] Firestore 復旧手順 (DR ドリル): 任意時刻への戻し方を 1 度試走
- [ ] セキュリティ監査 / Rules pen test: 本番切替前に外部レビュー or Emulator ベースの権限突破テスト
- [ ] Cloud Storage の retention policy / lifecycle rule (退会済テナントの削除タイミング)

### 9.6 Rollback 準備

- [ ] LocalStorage 単独運用へ戻す手順を文書化 (`src/repositories/index.ts` 1 行差し替え)
- [ ] Firestore 側差分が出た時の対処 (admin による手動修正 / Cloud Functions による再 sync)
- [ ] hybrid 期間中に問題発生時の判断基準

### 9.7 ドキュメント / 引き継ぎ

- [ ] 本書 (`docs/production-handoff-checklist.md`) の更新
- [ ] `src/repositories/firestore-design.md` の v1.x 更新履歴
- [ ] `src/repositories/README.md` の Phase 進捗表更新
- [ ] `src/services/auth/README.md` の Firebase Auth 移行完了マーク

---

## 10. SMS / メール本送信について

本リポは **`MessageLog` (統合連絡ログ) の土台までを提供する**。実際の送信処理 (SMS API 呼び出し、メール SMTP / SendGrid 連携、配信ステータスのコールバック) は **本リポの対象外** で、別エンジニアが別リポジトリ / 別サービスで実装する想定。

### 10.1 本リポの責務範囲

| 範囲 | 状態 |
|---|---|
| `MessageLog` 型定義 (channel / direction / status / 各種 timestamp) | ✅ |
| `MessageRepository` (listByApplicant / create / updateStatus / listRecent) | ✅ LocalStorage 実装 |
| 連絡履歴の画面表示 (ApplicantDetail) | ✅ |
| ドライランログ作成 (ATS 内テスト用) | ✅ |
| `smsLogs / emailLogs` (旧スキーマ) | ✅ 当面残す |

### 10.2 本リポの責務外

| 範囲 | 担当 |
|---|---|
| SMS API (Twilio / Vonage 等) 呼び出し | 別サービス |
| メール送信 (SendGrid / SES / SMTP) | 別サービス |
| 配信ステータス Webhook 受信 → MessageLog.status 更新 | 別サービス + 本リポの `messageRepository.updateStatus` を呼ぶ |
| テンプレート展開 (`{{name}}` 等のプレースホルダ置換) | 別サービス |
| 配信失敗時のリトライキュー | 別サービス |
| オプトアウト管理 / 法令対応 (特定電子メール法等) | 別サービス |

### 10.3 連携インターフェース

別サービス側は **本リポの `MessageRepository` を直接呼ばない**。代わりに:

- 本リポ画面側で `messageRepository.create(channel='sms', status='draft')` でドラフト作成
- 別サービスが draft を pull → プロバイダ送信 → `messageRepository.updateStatus(id, 'sent' | 'failed', { sentAt, errorMessage })` で結果反映

この境界を維持する限り、別サービスが Firestore 直接アクセスする必要はない (Cloud Functions API 経由を推奨)。

---

## 11. 質問 / 相談先

- 本書 + `src/repositories/firestore-design.md` + `src/repositories/README.md` + `src/services/auth/README.md` を読み込んだ上で疑問が残れば、本リポの Issue で確認
- 既存 Phase の判断理由・transaction 候補の解釈は **`src/repositories/README.md` を最優先**
- 「Repository に寄せるべきか?」の判断は `repositories/README.md §3.4`
- 「画面 1 つずつ async 化」のルールは `repositories/README.md §3.1`
- StageChangeReason 体系は `src/types/index.ts` (`StageChangeReason` 列挙)

---

## 12. 本書の補足対応履歴

- v1 初版 (2026-05-10): Phase A〜I 完了直後の引き継ぎチェックリスト
- v1.1 整合性レビュー反映 (2026-05-10): §9.5.1 性能 / 信頼性チェックを追加 (負荷試験 / Firestore PITR / DR ドリル / Rules pen test / Storage retention)
- v1.2 Phase K 完了反映 (2026-05-10):
  - §1.1: 完了済 Repository 表に `slotRepository` を追加
  - §1.3: ApplicantDetail / Calendar の Repository 化表に K-1〜K-4 を追加
  - §1.5: Phase 参照表に K を追加
  - §2.2: 未着手 Repository リストから SlotRepository を除去 (BaseRepository は ★★★ に残す。K-5 = BaseManagement 連携は BaseRepository フェーズで吸収する旨を備考に追記)
  - §4 Phase J-5: SlotRepository の脚注を「Phase K で完了済 + Firestore 実装方針」に置換
- v1.3 Phase L 完了反映 (2026-05-10):
  - §1.1: 完了済 Repository 表に `baseRepository` を追加 (Phase L-1〜L-3 完了)
  - §1.3: BaseManagement / Calendar の Repository 化表に L-1〜L-3 を追加
  - §1.5: Phase 参照表に L を追加 (K-5 を Phase L-3 で同時消化した旨を K 行に注記)
  - §2.2: 未着手 Repository リストから BaseRepository を除去。ClientRepository CRUD 補完を ★★★ に繰上げ
  - §4 Phase J-5: BaseRepository の優先順位記述を「Phase L で完了済 + Firestore 実装方針 (Cloud Functions 経由必須 / `tenants/{tid}/bases/{baseId}` + `slots/{date}` subcollection)」に置換
- v1.4 Phase M-1〜M-3 反映 (2026-05-11):
  - §1.1: `clientRepository` 行を「読み取り + saveAll + CRUD 5 API (Phase M-1)」に拡張。`create / update / delete / listChildren / detachChildBaseName` を主要 API に明記
  - §1.3: クライアント側画面 Repository 化表に M-1 / M-2 / M-3 行を追加
  - §1.5: Phase 参照表に M を追加（M-1=型 + LocalStorage、M-2=AccountSettings、M-3=BaseRepository 経由置換、M-4〜M-7 未着手）
  - §2.2: 未着手 Repository リストから「ClientRepository CRUD 補完」を除去（M-1 で完了したため）
  - §2.3: AdminApp 系の先頭に「ClientRepository M-4〜M-7 (AdminApp callsite 移行)」★★★ を追加。`clientOptions.incrementOptionUsage` の Repository 化検討項目も併記
  - §4 Phase J-5: 旧「ClientRepository CRUD 補完」を「ClientRepository M-4〜M-7」に書き換え。M-1〜M-3 で型 + 一部 callsite が完了済である旨を明記
- v1.5 Phase M-4〜M-8 完了反映 (2026-05-11):
  - §0: 30 秒サマリを M-1〜M-8 完了に書き換え。「Slot (Phase K) / Base (Phase L) / Client (Phase M)」を完了領域として明記。「クライアント系 `storage.getClients/saveClients` 直叩きはコードベースから完全消滅」を強調。設計書バージョンを v1.5 → v1.6 に更新
  - §1.1: `clientRepository` 行を「Phase M-1〜M-8 完了。クライアント系 storage 直叩きは全消滅。`saveAll` は authService.adminResetPassword 内部のみが利用」に更新
  - §1.3: クライアント側画面 Repository 化表に M-4〜M-8 行を追加（loadClients / handleToggleStatus + onUpdateClient / handleSave / handleDelete / adminResetPassword + handleUpdatePassword / incrementOptionUsage / BaseManagement read-only 経路）
  - §1.4: Firestore 設計書バージョンを v1.6 に更新
  - §1.5: Phase 参照表の M 行を「M-1〜M-8 すべて完了」に書き換え
  - §2.3: 「ClientRepository M-4〜M-7」と「clientOptions.incrementOptionUsage」を未着手リストから除去。残タスクを「設定系Repository」「AdminAccount/AdminLog/MediaIntegration」「契約・請求・解約管理」「テナント間データ移管 API」に整理。ClientRepository 完了の脚注を追加
  - §4 Phase J-5: 旧「ClientRepository M-4〜M-7」を「ClientRepository (Phase M-1〜M-8 で完了済)」に書き換え。Firestore 化時の残注意 (password は Firebase Auth、clientData/logs delete は Cloud Functions、`saveAll` 経路は Admin SDK / Cloud Functions に置換) を併記
