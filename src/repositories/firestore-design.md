# RISOTTO ATS — Firestore 移行設計書 (v1)

> このドキュメントは **設計案** であり、実装ではない。本リポは現在 LocalStorage / SessionStorage に依存しているが、Repository 層 (`src/repositories/`) と AuthService 層 (`src/services/auth/`) を境界として確定済み（Phase A〜M 完了）のため、本書では Firestore + Firebase Auth + Cloud Storage への移行を前提に「どんな collection / index / transaction / migration が必要か」を整理する。
>
> **対象読者**: 別エンジニアが Firestore 実装を担当する前提。
> **本書のスコープ外**: 実装、UI 変更、SMS / メール本送信、新機能追加、コスト試算。

---

## 0. 前提と制約

### 0.1 既存のアーキテクチャ境界 (Phase A〜I 完了済)

- **Repository 層** (`src/repositories/`): 画面コードは `applicantRepository.changeStage(...)` の形でしか保存処理を呼ばない。`src/repositories/index.ts` の 1 行差し替えで Firestore 実装に切替可能。
- **AuthService 層** (`src/services/auth/`): 認証 / セッション復元 / パスワード変更を `authService` に集約。Firebase Auth へは `index.ts` の 1 行差し替えで移行可能。
- **`SafeClient = Omit<Client, 'password'>`**: 画面 state には password を持たない。
- **既存 LocalStorage 実装は同期 API**: Firestore 実装は `Promise<T>` 化が前提だが、画面側は **画面 1 つずつ async 化** する方針 (`README.md §3.1`)。

### 0.2 Firestore 制約 (移行設計に効くもの)

- **1 ドキュメント = 1 MB 上限**: 現状の `ClientData` god-object は 5〜10 MB に達するため、必ずサブコレクション化する。
- **複合インデックスは事前定義必須**: `where + orderBy` の組み合わせは `firestore.indexes.json` で宣言。
- **transaction は最大 500 docs / 同一 region**: `BaseManagement.deleteBase` (8 配列カスケード) は 500 件以下になる前提で transaction、または Cloud Functions 側で reduce。
- **配列フィールドは部分更新不可** (要素単位): `arrayUnion / arrayRemove` で対応するが、添字指定の差分更新はできない。
- **採番は Firestore autoId 推奨** (number id は再採番が高コスト)。

### 0.3 移行の前提

- **本番認証**: Firebase Auth (Email/Password または Custom Token)。`src/services/auth/types.ts` の `AuthService` interface を満たす Firebase 実装を新設。
- **ファイル**: 添付は Cloud Storage に移動。`FileAttachment.url` を Cloud Storage の signed URL に置換。
- **テナント分離**: `parent` クライアントを 1 テナントとして扱う。`child` は同一テナント内のスコープ (拠点 = `baseName`) で読み書き範囲を絞る。
- **マイグレーション**: 既存 LocalStorage データは「one-shot エクスポートツール → Firestore に流し込み」で移行する想定 (§7)。

---

## 1. 現在の永続化キー一覧 (移行元)

### 1.1 LocalStorage (クライアント側)

| キー | ペイロード型 | 概要 | 想定サイズ |
|---|---|---|---|
| `hireflow:clients` | `Client[]` | テナント (= 企業) リスト。ログイン時に検索する | 数 KB 〜 数百 KB |
| `hireflow:client:${clientId}:data` | `ClientData` | god-object。応募者・面接・設定・各種ログを丸ごと内包 | **5〜10 MB に達する** (Firestore 1 MB 上限を超える) |
| `hireflow:client:${clientId}:logs` | `ClientOperationLog[]` | クライアント側操作ログ (最大 1000 件、auto-truncate) | 〜1 MB |

### 1.2 LocalStorage (管理画面側)

| キー | ペイロード型 | 概要 |
|---|---|---|
| `risotto:admin:accounts` | `AdminAccount[]` | 運営者アカウント (SHA-256 + salt パスワード、初期は平文 password fallback) |
| `risotto:admin:operation_logs` | `AdminOperationLogEntry[]` | 運営側操作ログ (FNV-1a ハッシュチェーンで改竄検知、最大 1000 件) |
| `risotto:admin:media` | `MediaIntegration[]` | 媒体連携設定 (Indeed / doda 等の API key、apiKey は平文) |

### 1.3 SessionStorage / LocalStorage (セッション)

| キー | ストレージ | ペイロード | 注 |
|---|---|---|---|
| `risotto-client-session` | sessionStorage | `SafeClient` (= `Omit<Client, 'password'>`) | Phase I-2a で SafeClient 化済 |
| `risotto:admin:session` | localStorage (remember me) / sessionStorage | `{ token, accountId, expiresAt, remember }` | Admin 用。30 日 or 24 時間 |

### 1.4 ファイル (添付)

- 場所: `Applicant.files: FileAttachment[]` → `ClientData.applicants[].files`
- 形式: `{ name, size, url }`
- 実態: 現状 `url` はプレースホルダ。base64 inline 想定だが、quota error 多発 (5 MB / file)。
- 結論: **Firestore に乗せるのは不可**。Cloud Storage 必須 (§9)。

---

## 2. Firestore Collection 設計案

### 2.1 設計方針

1. **テナント分離単位は `parent` クライアント**: child は同一テナントを共有。
2. **god-object `ClientData` を分解**: top-level の各配列を専用 subcollection / collection に展開。
3. **読み書き頻度で分離**:
   - 高頻度 (applicants / events / messageLogs) → 専用 collection、複合 index
   - 低頻度 (settings / chatScenarios / hearingTemplates) → settings doc 1 個に内包
4. **list 系の権限スコープ**: child アカウントの `baseName` フィルタは Firestore Security Rules で `where('base', '==', request.auth.token.baseName)` を強制。
5. **operation logs は append-only**: `created_at` で TTL ポリシー設定 (1 年保持等)。

### 2.2 Collection ツリー (推奨案)

```
/tenants/{tenantId}                              # tenantId = parent client.id
  ├─ company: { companyName, plan, status, contractStart, ... } # 旧 Client (password 抜き)
  ├─ permissions: { ... }                        # ClientPermissions
  ├─ options: { aiScreening: ClientOption, recruitmentReport: ClientOption }
  ├─ killSwitches: { aiScreening, emailSend, ... }
  │
  ├─ /accounts/{accountId}                       # parent + child 全アカウント
  │     { id, accountType, parentId, baseName, contactName, members, contactEmail, smsPhone, sessionInvalidatedAt, ... }
  │     # password / passwordHash は持たない (Firebase Auth 側)
  │
  ├─ /applicants/{applicantId}                   # 主データ
  │     { name, email, phone, base, job, src, stage, subStatus, active, duplicate, jobInfo, ...,
  │       createdAt, updatedAt, stageChangedAt, dataRetentionUntil, screening: ScreeningResult }
  │     ├─ /stageHistory/{historyId}             # 履歴は subcollection (app 内 N 件まで膨らむ)
  │     │     { stage, fromStage, toStage, changedAt, reason, operator }
  │     ├─ /cancelledInterviews/{idx}            # キャンセル履歴
  │     ├─ /chatAnswers/{idx}                    # チャット回答
  │     └─ /files/{fileId}                       # FileAttachment metadata + Cloud Storage path
  │           { name, size, storagePath: 'tenants/{tid}/applicants/{aid}/{fileId}', uploadedAt, contentType }
  │
  ├─ /events/{eventId}                           # InterviewEvent (面接)
  │     { applicantId, date, start, end, base, method, title, color, createdAt }
  │
  ├─ /messageLogs/{messageId}                    # 統合連絡ログ (新スキーマ)
  │     { applicantId, channel, direction, status, sentAt, ... }
  │
  ├─ /smsLogs/{logId}    (deprecated, 移行完了まで残す)
  ├─ /emailLogs/{logId}  (deprecated, 移行完了まで残す)
  ├─ /webhookLogs/{logId}
  ├─ /apiCallLogs/{logId}                        # Anthropic API コスト記録
  ├─ /invoices/{invoiceId}                       # 月次請求
  │
  ├─ /operationLogs/{logId}                      # クライアント側操作ログ
  │     { timestamp, operator, category, action, target, detail }
  │     # 改竄検知が必要なら chain field を持つ (現状は持っていない)
  │
  ├─ /exclusionList/{entryId}                    # 除外リスト (CRUD 単独)
  │     { type: 'email'|'phone'|'name_birth', email?, phone?, name?, birthDate?, applicantId? }
  │
  ├─ /bases/{baseId}                             # 拠点
  │     { name, nameKana, address, slotInterval, startTime, endTime, color, ... }
  │     └─ /slots/{date}                         # SlotSetting を date 単位の doc に展開
  │           { capacities: { 'HH:MM': number, ... } }   # time → capacity の map (日付内 1 doc)
  │
  ├─ /sources/{sourceId}                         # 応募媒体
  │     { name, color, monthlyCost, loginId, password, url }   # password 暗号化検討
  │
  ├─ /jobs/{jobId}                               # 職種
  │
  ├─ /statuses/{statusId}                        # ステータス定義
  │     { name, color, active, order, subStatuses, category }
  │
  ├─ /emailTemplates/{templateId}
  ├─ /hearingTemplates/{templateId}
  ├─ /chatScenarios/{scenarioId}
  ├─ /chatQuestionGroups/{groupId}
  ├─ /chatLeadSettings/{leadId}
  │
  ├─ /baseOverrides/{baseName}                   # 拠点別オーバーライド (現 jobsByBase / sourcesByBase / emailTemplatesByBase / filterConditions)
  │     { jobs: Job[], sources: Source[], emailTemplates: EmailTemplate[], filterCondition: FilterCondition }
  │     # 拠点単位で 1 doc。拠点削除時にこの doc も削除する (§5 cascade)
  │
  ├─ /settings/global                            # 単一 doc 化できる「クライアント全体設定」
  │     { filterCondition, screeningCriteria, recruitmentGoals, mediaCosts, reportSchedule }
  │     # それぞれを別 doc にしてもよい (アクセスパターン要件次第)
  │
  └─ /monthlyStats/{ym}                          # 集計キャッシュ (オプション)
        { ym, applicantsCount, hiredCount, costPerHire, ..., generatedAt }


/admins/{accountId}                              # 運営者アカウント (Firestore + Firebase Auth カスタムクレーム role='admin')
  ├─ profile: { name, email, role: 'super'|'operator', active, createdAt, lastLoginAt, failedAttempts, lockedUntil }
  └─ /operationLogs/{logId}                      # 運営側操作ログ (chain hash 維持)


/admin/mediaIntegrations/{integrationId}         # 全テナント横断 (Indeed / doda 等の SaaS 連携)
      { name, type, apiKey: 'enc:XXX', webhookUrl, status, connectionStatus, lastSync }
      # apiKey は Cloud KMS 暗号化 (§8.4)


/_indexes/...                                    # 以下 §3 で定義
```

### 2.3 Collection を分けず doc 内に保つもの

下記は「テナント全体で 1 doc」で十分。`tenants/{tenantId}/settings/global` 等にまとめる:

| 保管先 doc 案 | 内容 |
|---|---|
| `tenants/{tid}` (root doc) | `companyName / plan / status / contractStart / contractEnd / contactName / contactEmail / memo / featureKillSwitches / sessionInvalidatedAt / cancellationDate / ...` |
| `tenants/{tid}/permissions/v1` | `ClientPermissions` |
| `tenants/{tid}/options/{optionKey}` | `ClientOption` (aiScreening / recruitmentReport)。`usageByMonth: { 'YYYY-MM': number }` は同一 doc 内 map field として保持し、書き込みは `FieldValue.increment(1)` で race-free 更新する |
| `tenants/{tid}/settings/global` | `filterCondition / screeningCriteria / recruitmentGoals / mediaCosts / reportSchedule` |

> **注**: §2.2 のツリーには `featureKillSwitches / sessionInvalidatedAt / cancellationDate` を root doc 直下と書いたが、図上は省略している。実装時は `tenants/{tid}` の **root doc に直接フラットに持つ** こと。subcollection 化しない (1 doc / 1 read で取得できる経路を維持)。

### 2.4 設計判断の根拠

| 判断 | 理由 |
|---|---|
| applicants を subcollection ではなく `tenants/{tid}/applicants` の collection group | 件数が多い (千件超) ため。subcollection でも可だが collection group クエリが効く |
| stageHistory を subcollection に分離 | applicant doc が 1 MB を超えるリスク (履歴数百件 × 監査メタ)。集計に効かせるなら別途 BigQuery エクスポートも検討 |
| events を applicants subcollection にしない | カレンダー UI が「拠点 × 日付範囲」で query するため、collection group でも良いが top-level の方が index がシンプル |
| messageLogs / smsLogs / emailLogs / webhookLogs / apiCallLogs を独立 collection | 件数増加が早い + ログ単位の TTL 管理が必要 |
| baseOverrides は base 名キーで 1 doc | 拠点ごとに「全項目セット」で読みたい / 削除も同時。複数 collection に分けると BaseRepository の cascade が複雑化 |
| operationLogs を tenants 内に配置 | テナント単位の権限制御が容易。改竄検知 hash chain は client-side では不完全なため Cloud Functions で append-only 強制を推奨 |

---

## 3. Index 候補 (firestore.indexes.json)

下記は **画面で実際に走る query** から逆引きした必要 index。Firestore は単一フィールド昇順の自動 index は付くため、**複合 index のみ列挙**する。

### 3.1 applicants (`tenants/{tid}/applicants`)

| 用途 | query | 必要 index |
|---|---|---|
| ApplicantList の絞り込み | `where('stage', '==', s) + where('base', '==', b) + orderBy('createdAt', 'desc')` | `(stage, base, createdAt desc)` |
| KanbanBoard | `where('active', '==', true) + orderBy('stageChangedAt', 'desc')` | `(active, stageChangedAt desc)` |
| 拠点別取込 (child アカウント) | `where('base', '==', baseName) + orderBy('date', 'desc')` | `(base, date desc)` |
| 媒体別レポート | `where('src', '==', source) + where('createdAt', '>=', from) + where('createdAt', '<=', to)` | `(src, createdAt)` |
| 職種別レポート | `where('job', '==', job) + where('createdAt', '>=', from)` | `(job, createdAt)` |
| 重複検知 | `where('email', '==', email)` (単一) | 自動 |
| AI スクリーニング待ち | `where('screening', '==', null) + where('active', '==', true)` | `(active, createdAt)` で代替可 |
| データ保持期限切れバッチ | `where('dataRetentionUntil', '<=', today)` | 自動 |

### 3.2 events (`tenants/{tid}/events`)

| 用途 | query | index |
|---|---|---|
| Calendar 週表示 | `where('base', '==', b) + where('date', '>=', from) + where('date', '<=', to)` | `(base, date)` |
| ApplicantDetail の面接履歴 | `where('applicantId', '==', id)` | 自動 |
| 月次集計 | `where('date', '>=', monthStart) + where('date', '<=', monthEnd)` | 自動 |

### 3.3 messageLogs / smsLogs / emailLogs

| 用途 | query | index |
|---|---|---|
| ApplicantDetail の連絡履歴 | `where('applicantId', '==', id) + orderBy('createdAt', 'desc')` | `(applicantId, createdAt desc)` |
| 月次 SMS / メール集計 | `where('sentAt', '>=', monthStart) + where('sentAt', '<=', monthEnd) + where('status', '==', 'success')` | `(status, sentAt)` |
| 失敗ログ抽出 | `where('status', '==', 'failed') + orderBy('failedAt', 'desc')` | `(status, failedAt desc)` |

### 3.4 operationLogs

| 用途 | query | index |
|---|---|---|
| 操作者別フィルタ | `where('operator', '==', name) + orderBy('timestamp', 'desc')` | `(operator, timestamp desc)` |
| カテゴリ絞り込み | `where('category', '==', c) + orderBy('timestamp', 'desc')` | `(category, timestamp desc)` |
| 期間絞り込み | `where('timestamp', '>=', from) + where('timestamp', '<=', to)` | 自動 |

### 3.5 reports / monthlyStats

| 用途 | query | index |
|---|---|---|
| 採用レポート月次 | `where('ym', '>=', from) + where('ym', '<=', to)` | 自動 |

### 3.6 admin

| 用途 | query | index |
|---|---|---|
| 運営側の全テナント横断検索 (例: status=inactive のテナント一覧) | `collectionGroup('tenants') + where('status', '==', 'inactive')` | collection group 用 single-field index |

> **注**: Firestore の自動生成だけで足りる単一フィールド query は省略している。実装時は emulator で `INDEX needed` エラーから生成するのが確実。

---

## 4. Transaction / Batch Write 候補

`README.md §4.1` / `§10.4` / `§9.2` で既に整理済の transaction 候補を、Firestore のオペレーション単位に再整理する。

### 4.1 必須 transaction

| 操作 | 対象 docs | 理由 |
|---|---|---|
| **`scheduleInterview`** (`eventRepository.scheduleInterview`) | events doc 追加 + applicant doc 更新 (stage / stageHistory / stageChangedAt / updatedAt) | 途中失敗で「予約はあるのに stage が前のまま」になるのを防ぐ |
| **`removeWithCancelRecord`** (`eventRepository.removeWithCancelRecord`) | events doc 削除 + applicant.cancelledInterviews 追加 | 整合性。cancelledInterviews を subcollection 化するなら applicant doc 更新は不要だが、削除と subcollection 追加は同一 transaction 推奨 |
| **`changeStageBulk`** (`applicantRepository.changeStageBulk`) | 複数 applicant doc 更新 (stage / stageHistory / active / updatedAt) | 一括除外で「半分だけ移動した」状態を防ぐ。500 docs 上限超過時は WriteBatch を複数回に分割 + Cloud Functions 側で整合性確認 |
| **`clearStageForDeletedStatus`** (`applicantRepository.clearStageForDeletedStatus`) | 全 applicants の stage / stageHistory 掃除 | Status 削除に伴う orphan 参照クリア。500 件超なら Cloud Functions の chunked batch |
| **`applicantRepository.delete`** | applicant doc 削除 + events 削除 (applicantId 一致) + exclusionList 削除 (applicantId 一致) | Firestore に cascade delete はないので transaction 必須 |
| **`exclusionList.addEntry`** (現状 2 段 save) | exclusionList doc 追加 + matched applicants の stage 一括変更 | 既存 LocalStorage 実装は 2 段 save。Firestore 化と同時に 1 transaction 化を検討 (`README.md §4.1`) |
| **`statusRepository.removeWithCascade`** (未実装、Repository 化候補) | statuses doc 削除 + applicants 側 stage クリア | 現状 2 段呼出 (`statusRepository.remove` + `applicantRepository.clearStageForDeletedStatus`)。Firestore 化時に 1 メソッド化 + transaction |
| **`baseRepository.deleteWithCascade`** (未実装、§5 で詳述) | bases doc 削除 + slots / baseOverrides / applicants の base クリア / events 削除 (8 配列) | 現状 `BaseManagement.deleteBase` で 1 saveClientData にまとめている。Firestore 化時は 500 doc 上限を超える可能性あり、Cloud Functions に分離 |
| **`authService.changePassword`** (Firebase Auth 移行後) | Firebase Auth 側パスワード更新 + tenant 側 sessionInvalidatedAt 更新 | パスワード変更後の session 強制失効と整合させる |
| **child アカウントの baseName 変更** | `accounts/{aid}` doc 更新 + Firebase Auth Custom Claims (`baseName`) 更新 | ストレージが別系統 (Firestore + Auth) のため Cloud Functions で順次更新 + 失敗時 idempotent 再実行。途中失敗で「doc は新拠点 / claim は旧拠点」状態になると Security Rules が破綻する |

### 4.2 推奨 transaction (LocalStorage では同期だが Firestore では推奨)

| 操作 | 理由 |
|---|---|
| **`applicantRepository.create` (initialStageReason 指定時)** | applicant doc + stageHistory subcollection 追加。`README.md §8.6` 参照 |
| **`applicantRepository.update`** | 単一 doc 更新だが `withUpdatedMeta` の自動付与と patch のマージで「touch せずに stage だけ書く」事故を防ぐ意味で transaction でラップ推奨 |

### 4.3 Batch write で十分なもの (transaction 不要)

| 操作 | 理由 |
|---|---|
| CSV インポート (createMany 未実装) | 失敗時はリトライで吸収可能。500 件単位の WriteBatch で十分 |
| operation logs / messageLogs の append | 単一 doc。transaction 不要 |
| settings 系 (statuses / sources / jobs / templates) の一括保存 | 単一 doc または 1 collection 内の少件数。WriteBatch で十分 |
| AdminAccount のロックアウト更新 (`failedAttempts++` / `lockedUntil` / `lastLoginAt`) | 同一 doc の field 更新。`FieldValue.increment(1)` で十分 |
| `incrementOptionUsage` (`tenants/{tid}/options/{key}.usageByMonth['YYYY-MM']`) | `FieldValue.increment(1)` で race-free。LocalStorage の get-modify-set パターンを置換 |

### 4.4 Cloud Functions 経由を推奨するもの

| 操作 | 理由 |
|---|---|
| `BaseManagement.deleteBase` | 8 配列カスケード。500 doc 超過のリスクあり、サーバ側 Cloud Functions で reduce |
| `Client.cancellationDate` 到来時の自動 inactive 化 | スケジュール実行 (Cloud Scheduler + Functions) |
| `Applicant.dataRetentionUntil` 経過時のバッチ削除 | スケジュール実行 |
| operation logs の改竄検知 hash chain | client から書くと chain 偽造可能。Cloud Functions で append-only 強制 + chain 計算をサーバ側で実施 |
| Anthropic API 呼び出し (apiCallLogs 生成) | API key を client に置かないため、サーバ側で実行 |
| Custom Claims 付与 / 更新 (`tenantId / accountType / baseName / accountId / role`) | Firebase Auth Admin SDK は client から呼べないため、Cloud Functions HTTP API 経由で `auth.setCustomUserClaims` を呼ぶ。新規 child 登録 / baseName 変更 / 運営権限付与 に必要。詳細は §6.4 / §10.6.4 |

---

## 5. Repository 化の残タスク (Firestore 移行前に注意)

設定系画面の `updateClientData` 直叩きは **Phase N-1〜N-10 で全 10 画面の Repository 化が完了**。残るのは AdminApp 系（Client 以外）と、`AddApplicantModal.tsx` の duplicate flag 一括更新 1 callsite のみ。

> **Phase N 完了状態（2026-05-12）**:
> - 10 設定画面（Job / Source / EmailTemplate / Hearing / ReportSchedule / Exclusion / MediaCost / FilterCondition / Screening / Chatbot）が Repository 経由化済
> - 設定画面側の `updateClientData` 実コールは 0 件（コメント / JSDoc のみ残置）
> - `AuthContext.updateClientData` shim は `AddApplicantModal.tsx:284` の 1 callsite を最後に残すのみ → 撤去候補

### 5.1 SlotRepository (✅ Phase K-1〜K-4 完了 — `README.md §11`)

- 対象: `Calendar.tsx` の `setSlotCapacity` / `bulkSetAllSlots` / `handleBulkApply` (K-2〜K-4 で全経路 Repository 化済)
- 残タスク (K-5): `BaseManagement.deleteBase` 内の slotSettings 削除を `slotRepository.removeBase` に置換 (BaseRepository フェーズと同時。8 配列カスケードのアトミック性維持のため単独着手しない)
- 確定 API:
  ```ts
  interface SlotRepository {
    listBase(tid: string, baseName: string): SlotSetting;
    getDay(tid, baseName, date): SlotDayCapacity;
    getCapacity(tid, baseName, date, time): number;
    setCapacity(tid, baseName, date, time, capacity: number): void;
    bulkSetCapacity(tid, baseName, cells: SlotBulkPatch[]): BulkSetCapacityResult;
    removeBase(tid, baseName): RemoveBaseSlotsResult;  // BaseRepository から呼ぶ
  }
  ```
- Firestore マッピング: `tenants/{tid}/bases/{baseId}/slots/{date}` (date doc 内に `capacities: { 'HH:MM': number }` map field)
- `bulkSetCapacity` の Firestore 実装: cells を date ごとにグルーピング → WriteBatch で各 date doc を `update(doc, { ['capacities.' + time]: capacity })` で map field の部分更新。500 cells 超は WriteBatch chunk
- 同値 no-op / 空変更検知で `saveClientData` 抑制 (LocalStorage 実装) → Firestore でも doc write コスト削減につながる

### 5.2 BaseRepository (✅ Phase L-1〜L-3 完了 — `README.md §12`)

- 対象: `BaseManagement.tsx` (`save` / `deleteBase`) / `Calendar.tsx` (`saveBaseSettings`)
- 完了範囲:
  - L-1: 型 + LocalStorage 実装（画面未連携）。`computeRemoveBasePatch` を `slotRepository.ts` に切出し、baseRepository / slotRepository の双方から共有
  - L-2: `BaseManagement.save` / `Calendar.saveBaseSettings` を `baseRepository.create` / `update` 経由に置換。rename 非カスケードの既存挙動を維持
  - L-3: `BaseManagement.deleteBase` を `baseRepository.deleteWithCascade` 経由に置換。8 配列カスケード + child アカウント baseName クリアを Repository 内に集約。K-5 を同時消化
- `deleteWithCascade` の対象（**1 saveClientData + 必要時のみ 1 saveClients**）:
  - `bases.filter(...)` 削除
  - `applicants.map(...)` で `base === target` を `''` クリア（履歴保持・updatedAt は touch しない）
  - `events.filter(...)` で `base === target` 全削除（未来面接削除）
  - `slotSettings[target]` 削除（`computeRemoveBasePatch` 経由）
  - `jobsByBase[target]` / `sourcesByBase[target]` / `emailTemplatesByBase[target]` / `filterConditions[target]` 削除
  - 別 storage の `clients[]` から子アカウントの `baseName === target` をクリア（`detachedChildAccountCount > 0` のときのみ saveClients 発火）
- Firestore 化時の挑戦: 8 collection / doc に跨る delete + update。500 doc transaction 上限を超える可能性 → **Cloud Functions 経由が現実的**。child アカウントの baseName クリアは Firebase Auth Custom Claims 更新も伴うため、Cloud Functions 側で idempotent に処理（§4.1 / §10.6.4）
- 確定 API:
  ```ts
  interface BaseRepository {
    list(clientId): Base[];
    get(clientId, baseId): Base | undefined;
    findByName(clientId, baseName): Base | undefined;
    create(clientId, base: Omit<Base, 'id'>): Base;
    update(clientId, baseId, patch: Partial<Omit<Base, 'id'>>): Base | undefined;
    deleteWithCascade(clientId, baseId): DeleteBaseCascadeResult;
  }

  interface DeleteBaseCascadeResult {
    removed: boolean;
    removedBaseName?: string;
    clearedApplicantBaseCount: number;
    removedEventCount: number;
    removedSlotDateCount: number;
    removedJobsByBase: boolean;
    removedSourcesByBase: boolean;
    removedEmailTemplatesByBase: boolean;
    removedFilterCondition: boolean;
    detachedChildAccountCount: number;
  }
  ```
- Firestore マッピング: `tenants/{tid}/bases/{baseId}` doc + `tenants/{tid}/bases/{baseId}/slots/{date}` subcollection（§5.1 と整合）
- rename カスケードは未実装（既存仕様維持）。仕様変更が必要なら `renameWithCascade` を別フェーズで新設する想定

### 5.3 設定系 Repository (✅ Phase N-1〜N-10 完了 — `README.md §14`)

設定系画面の 10 配列はすべて Repository 経由化済。`updateClientData` 直叩きはコードベースから消滅。詳細設計（API 契約・base-override・cascade・deep copy 方針）は `README.md §14` の各 N-x 節を参照。

| 画面 | 直書きしていた配列 | Repository | Phase |
|---|---|---|---|
| `JobManagement.tsx` | `jobs` / `jobsByBase[base]` | JobRepository (Job CRUD + base override + cascade) | ✅ N-1 |
| `SourceManagement.tsx` | `sources` / `sourcesByBase[base]` | SourceRepository | ✅ N-2 |
| `EmailTemplateManagement.tsx` | `emailTemplates` / `emailTemplatesByBase[base]` | EmailTemplateRepository | ✅ N-3 |
| `HearingManagement.tsx` | `hearingTemplates` | HearingRepository | ✅ N-4 |
| `ReportScheduleSettings.tsx` | `reportSchedule` | reportRepository 拡張（getSchedule / saveSchedule） | ✅ N-5 |
| `ExclusionList.tsx` | `exclusionList` | ExclusionRepository (`add` + `applicantRepository.changeStageBulk` 2 段) | ✅ N-6 |
| `MediaCostManagement.tsx` | `mediaCosts[ym][source]` | MediaCostRepository | ✅ N-7 |
| `FilterConditionSettings.tsx` | `filterCondition` / `filterConditions[base]` | FilterConditionRepository | ✅ N-8 |
| `ScreeningSettings.tsx` | `screeningCriteria` (axes / byJob 含む) | ScreeningRepository (`getGlobal / getForJob / saveAll`) | ✅ N-9 |
| `ChatbotManagement.tsx` | `chatScenarios` / `chatQuestionGroups` / `chatLeadSettings` | ChatbotRepository (3 配列管理) | ✅ N-10 |

**Phase N 完了による副次効果**:
- `src/utils/baseScope.ts` の dead 6 helper（`resolveScreeningCriteria` / `hasScreeningJobOverride` / `resolveEmailTemplates` / `hasJobsOverride` / `hasSourcesOverride` / `hasEmailTemplatesOverride`）を O-1 で削除済。残るは `resolveJobs` / `resolveSources` の 2 関数（AddApplicantModal / ApplicantDetail で現役）
- 設定画面側の `useAuth` 分割代入から `updateClientData` を除去、`reloadClientData` に統一済

**残タスク（Phase N 後継）**:
- `AddApplicantModal.tsx:284` の `updateClientData` 経由 duplicate flag 一括更新 → applicantRepository に composite API を追加する形で撤去予定（O-3 で着手）。子アカウント書込の権限境界（base 絞込 + 他拠点合算）を Repository 側で同等再現する必要あり
- `AuthContext.updateClientData` shim の撤去 → O-3 完了後（O-4）。設定 10 画面 + AddApplicantModal で 0 callsite を確認したうえで interface / 実装 / export を削除
- `baseScope.ts` 全体削除 → `resolveJobs / resolveSources` を JobRepository / SourceRepository の新規 API（`listForBase` 等）に置換した後（O-5）

### 5.4 AdminApp 系 (未着手)

| 直書き対象 | 必要 Repository | 備考 |
|---|---|---|
| `risotto:admin:accounts` | AdminAccountRepository | Firebase Auth + Firestore `/admins/{id}` で代替 |
| `risotto:admin:operation_logs` | AdminLogRepository | hash chain は Cloud Functions 側で計算 |
| `risotto:admin:media` | MediaIntegrationRepository | apiKey は KMS 暗号化必須 |
| `localStorage.getItem('hireflow:client:${id}:data')` 直読み | (admin がクライアントデータをコピー / 移管する経路で発生) | テナント間データ移動 = Cloud Functions 専用 API に分離 |

#### 5.4.1 ClientRepository の CRUD 補完 (Phase M — ✅ M-1〜M-8 すべて完了)

**M-1 で 5 API を追加し、M-2 で AccountSettings、M-3 で BaseRepository、M-4〜M-7 で AdminApp 全 callsite + `clientOptions.incrementOptionUsage`、M-8 で BaseManagement の削除確認 read-only 経路から `storage.getClients/saveClients` 直叩きを完全解消**。クライアント系 storage 直叩きはコードベースから消滅。詳細設計は `README.md §13` を参照。

```ts
interface ClientRepository {
  // 既存（Phase I 系）
  list(): Client[];
  findById(id): Client | undefined;
  findForLogin(id, password): Client | undefined;
  saveAll(clients): void; // M-8 完了時点では authService.adminResetPassword 内部の限定用途のみ。Firestore 化（J-5）時に撤去候補

  // M-1 で追加
  create(client: Client): Client; // 同 id 衝突時は idempotent (既存返却・save 無)
  update(
    id: string,
    patch: Partial<Omit<Client, 'id' | 'password'>>,
  ): Client | undefined; // 同値 no-op
  delete(id: string): { removed: boolean; deletedChildAccountCount: number }; // parent → child cascade
  listChildren(parentId: string): Client[];
  detachChildBaseName(
    parentId: string,
    baseName: string,
  ): { detachedCount: number };
}
```

**設計判断（M-1〜M-8 確定事項）**:
- `password` は型レベルで `update` patch から除外。変更・リセット・照合は `authService.changePassword / adminResetPassword`（M-7a で導入完了）の責務。LocalStorage 期は `adminResetPassword` 内部が `clientRepository.saveAll` 経由で password 含む全件差し替えを行うが、これは Firebase Auth 移行時に Admin SDK / Cloud Functions に置換される
- `delete` のカスケードは **`clients` 配列のみ**（parent 削除時の child cascade を含む）。`clientData (hireflow:client:{id}:data)` / `operationLogs (hireflow:client:{id}:logs)` / Firebase Auth ユーザーの削除は AdminApp orchestrator の責務に残す（M-6 で実装。Firestore 化時は Cloud Functions の subcollection 再帰削除 or `tenants/{tid}` doc delete トリガに移管）
- ClientRepository は他 Repository に依存しない（`storage` のみ参照）。BaseRepository / ApplicantRepository 等から自由に inject 可能（循環依存なし）
- `saveAll` は M-8 完了時点で `authService.adminResetPassword` 内部のみが呼ぶ限定 API に縮退。Firestore 化（Phase J-5）時に `adminResetPassword` 自体が Firebase Auth Admin SDK / Cloud Functions に切替わるタイミングで撤去候補

**M-1〜M-8 完了によるメリット**:
- AccountSettings / AdminApp / BaseManagement / clientOptions から `storage.getClients/saveClients` 直叩きが完全消滅 → 平文 password を画面コードから完全排除（型レベル静的ブロック + 実行時 strip の二重防御）
- BaseRepository の cascade 内 child baseName クリアが ClientRepository に集約 → Firestore 化時に「accounts doc 更新 + Custom Claims 更新」を 1 メソッド境界で Cloud Functions に切替できる
- AdminApp の handleSave / handleDelete / handleToggleStatus / handleUpdatePassword はすべて Repository / authService 経由 → Firestore 化時に画面コードを 1 行も変えずに `src/repositories/index.ts` + `src/services/auth/index.ts` の差し替えで切替可能

**完了内訳 (M-1〜M-8)**:
- M-1: 型 + LocalStorage 実装の 5 API 追加（create / update / delete / listChildren / detachChildBaseName）。画面未連携
- M-2: AccountSettings の 4 callsite を `findById + update` 経由に
- M-3: baseRepository.deleteWithCascade の child baseName クリアを `detachChildBaseName` 経由に
- M-4: AdminApp.loadClients を `clientRepository.list()` 経由に
- M-5a: AdminApp.handleToggleStatus / `onUpdateClient` prop 内部を `findById / update / list` 経由に（prop シグネチャは維持）
- M-5b: AdminApp.handleSave を `create / update` 経由に。親 companyName 変更時の child companyName 追従は `listChildren` + `update` で維持
- M-6: AdminApp.handleDelete を `delete` 経由に（child cascade は Repository 内、clientData / operationLogs キー削除は orchestrator 側に維持）
- M-7a: AuthService に `adminResetPassword` 追加 + AdminApp.handleUpdatePassword を `authService.adminResetPassword` 経由に
- M-7b: `clientOptions.incrementOptionUsage` を `findById + update` 経由に
- M-8: BaseManagement の削除確認用 child 件数取得を `listChildren` 経由に

### 5.5 Repository 化が完了しているもの (移行時の安全領域)

| Repository | 完了フェーズ |
|---|---|
| `clientRepository` (list / findById / findForLogin / saveAll + create / update / delete / listChildren / detachChildBaseName) | Phase 1 + Phase M（M-1〜M-8 完了。クライアント系 storage 直叩きは全消滅。`saveAll` は authService.adminResetPassword 内部のみが利用） |
| `clientDataRepository` (get / save / delete) | Phase 1 |
| `applicantRepository` (full CRUD + bulk + cascade delete) | Phase A〜G |
| `statusRepository` (CRUD + 並び替え + サブステ) | Phase D |
| `eventRepository` (CRUD + scheduleInterview + removeWithCancelRecord) | Phase H |
| `slotRepository` (listBase / getDay / getCapacity / setCapacity / bulkSetCapacity / removeBase) | Phase K (K-1〜K-4 完了 / K-5 = BaseManagement 連携は Phase L-3 で集約) |
| `baseRepository` (list / get / findByName / create / update / deleteWithCascade) | Phase L (L-1〜L-3 完了) |
| `messageRepository` (listByApplicant / create / updateStatus) | 2026-05 |
| `reportRepository` (採用目標) | (限定的) |
| `authService` (login / logout / restore / changePassword) | Phase I |

---

## 6. Tenant 分離設計 (parent / child / admin)

### 6.1 マルチテナント方針

- **テナント = `parent` クライアント**: `tenantId = parent.id`
- **`child` アカウントは同一テナント内のスコープユーザー**: `tenants/{tid}/accounts/{childId}` に置く。`baseName` でデータ範囲を絞る (拠点フィルタ)。
- **`admin` (運営) は全テナント横断**: `/admins/{accountId}` に置く。Custom Claims `role: 'admin'` で識別。

### 6.2 既存 helper との対応

```ts
// src/repositories/index.ts (現状)
export function resolveDataOwnerId(client: { id, accountType, parentId }): string {
  return client.accountType === 'child' && client.parentId ? client.parentId : client.id;
}
```

→ Firestore 化後は **`tenantId = resolveDataOwnerId(authedClient)`** をすべての Repository 呼出で使う。Repository 内部では受け取った `tenantId` を `tenants/{tid}/...` パスに展開。child の baseName スコープは Security Rules で強制 (§8)。

### 6.3 child アカウント の baseName フィルタ

- 画面側: `AuthContext.filterDataByBase(data, baseName)` で 3 配列 (applicants / events / slotSettings) に対してフィルタしている。
- Firestore 化後: クライアント側でフィルタする経路を残しつつ、**Security Rules でも強制**して防御深度を上げる。
  ```
  match /tenants/{tid}/applicants/{aid} {
    allow read: if request.auth != null
                && request.auth.token.tenantId == tid
                && (request.auth.token.role == 'parent'
                    || resource.data.base == request.auth.token.baseName);
  }
  ```

### 6.4 Custom Claims 設計

Firebase Auth User にカスタムクレームを付与:

| Claim | 意味 |
|---|---|
| `tenantId` | 所属テナント (= parent.id) |
| `accountType` | `'parent' \| 'child' \| 'admin'` |
| `baseName` | child のみ。閲覧拠点 |
| `accountId` | tenants/{tid}/accounts/{accountId} の id |
| `role` | `'admin'` の場合に Security Rules でテナント横断アクセスを許可 |

クレームの更新は Cloud Functions (Auth onCreate / 管理画面からの変更時)。

---

## 7. Migration 手順案 (LocalStorage → Firestore)

### 7.1 想定方式: One-Shot Export Tool + 並行運用 (Hybrid) 期間

LocalStorage が **ブラウザ内** にしかないため、ユーザー一人ひとりにエクスポートを実行させる必要がある。下記方式を推奨:

#### 7.1.1 ステップ 1: クライアント側エクスポート機能の実装 (新規)

- 管理画面 (`AdminApp`) に「全データを JSON エクスポート」機能を追加
- 各クライアント (parent) ごとに `hireflow:clients` + 全 `hireflow:client:${id}:data` + `hireflow:client:${id}:logs` を 1 ファイルに固める
- ユーザーがブラウザで実行 → JSON ダウンロード → 運営に提出

#### 7.1.2 ステップ 2: サーバ側インポートツール (Cloud Functions / Admin SDK)

- 受領した JSON を Firestore に流し込む CLI / Cloud Functions
- 下記の変換を実行:

| 変換 | 内容 |
|---|---|
| `Client[]` → `tenants/{id}` doc | `password` を排除 (Firebase Auth 側で別途登録) |
| `ClientData.applicants[]` → `tenants/{tid}/applicants/{aid}` | id を string 化 (現状 number)、`stageHistory` を subcollection 展開 |
| `ClientData.events[]` → `tenants/{tid}/events/{eid}` | id 採番方式変更 (max+1 → autoId) |
| `ClientData.exclusionList[]` → `tenants/{tid}/exclusionList/{eid}` | applicantId 参照を string 化 |
| `ClientData.statuses[]` 等の配列 → 各 collection | order フィールドを保持 |
| `ClientData.slotSettings[base][date][time]` → `bases/{base}/slots/{date}` | 3 階層 map を date 単位の doc に分解 |
| `ClientData.{jobsByBase,sourcesByBase,emailTemplatesByBase,filterConditions}` → `baseOverrides/{baseName}` | 4 オブジェクトを 1 doc に集約 |
| `ClientData.messageLogs[]` 等のログ系 → 各 collection (autoId) | createdAt / updatedAt を timestamp 型に正規化 |
| `ClientData.{smsLogs,emailLogs,webhookLogs,apiCallLogs,invoices}[]` → 各 collection (autoId) | sentAt 等を timestamp 型に正規化。deprecated 扱いの smsLogs / emailLogs も移行期は流し込む |
| `hireflow:client:${id}:logs` (`ClientOperationLog[]`) → `tenants/{tid}/operationLogs/{lid}` | timestamp を Firestore Timestamp 化。改竄検知 chain は移行後に Cloud Functions で再構築 (移行データには chain hash を付与しない) |
| `Applicant.files[]` の inline url → Cloud Storage アップロード後 storagePath に置換 | base64 デコード → Cloud Storage put → metadata に storagePath 保存 |
| `risotto:admin:accounts` → `/admins/{aid}` collection + Firebase Auth | passwordHash は Firebase Auth へ。lockedUntil / failedAttempts は doc に残す |
| `risotto:admin:operation_logs` → `/admins/{aid}/operationLogs/{lid}` | hash chain は移行後に Cloud Functions で再構築 (旧 chain は破棄) |
| `risotto:admin:media` → `/admin/mediaIntegrations/{mid}` | apiKey は Cloud KMS / Secret Manager に分離。Firestore には参照キーのみ |

#### 7.1.3 ステップ 3: Firebase Auth ユーザー登録

- 既存 `Client.password` (平文) / `AdminAccount.passwordHash` (SHA-256) からは Firebase Auth へ直接移せない
- **オプション A**: 全ユーザーにパスワード再設定メールを送る (推奨)
- **オプション B**: 移行ツールで仮パスワード発行 → 初回ログイン時に強制変更

#### 7.1.4 ステップ 4: Hybrid 運用期間 (任意)

- `Repository` のシングルトンを切替フラグで分岐させ、書き込みは Firestore + LocalStorage 両方、読み込みは Firestore に切替できる構成にする
- 移行検証期間として 1〜2 週間運用後、LocalStorage を破棄

### 7.2 ID 型の扱い (number → string)

| 現状 | Firestore 移行後 | 影響 |
|---|---|---|
| `Applicant.id: number` (max+1 採番) | `string` (autoId) | 画面側の `applicant.id === id` (number) 比較が崩れる |
| `InterviewEvent.id: number` | `string` | 同上 |
| `ExclusionEntry.id: number` | `string` | 軽微 |
| `Status.id: number` | `string` | UI 操作 (toggleActive など) は name ベース (Phase D-2) なので影響軽 |
| `Source.id / Base.id / Job.id / Member.id / EmailTemplate.id` | `string` | UI コードの修正必要 |
| `MessageLog.id: string` (既に string) | そのまま | 影響なし |

**移行戦略**:
- A 案 (推奨): 型を `string` に統一する PR を Firestore 実装前に分離して投入。number 比較 (`a.id === id`) を `String(a.id) === id` などで吸収
- B 案: Firestore 側で number id を維持 (`id: 1234` を doc id `'1234'` として使う)。可能だが将来的に id 競合のリスクあり

### 7.3 Timestamp の正規化

LocalStorage では:
- ISO 8601 文字列 (`'2026-04-30T09:30:00.000Z'`)
- `new Date().toLocaleString('ja-JP')` の不統一形式 (`cancelledInterviews.cancelledAt`)

Firestore では `Timestamp` 型に統一する。`toLocaleString('ja-JP')` の値は移行時にパース失敗する可能性があり、エラー件数を計測してログ化する必要あり。

### 7.4 stageHistory の補完 (`applicantLifecycle.inferCreatedAt` 由来)

- 既存データには `createdAt` / `stageChangedAt` が欠落しているレコードがある (旧データ後方互換)
- 補完ロジックは `src/utils/applicantLifecycle.ts` にあるが、**Firestore に書き込む時点で in-memory に補完**してから流す。読み取り時の自動補完は止める方向 (Firestore データはイミュータブルに正規化された状態を保つ)

---

## 8. Security Rules / 権限設計の前提

### 8.1 認証前提

- Firebase Auth で User 作成
- Custom Claims に `{ tenantId, accountType, baseName, accountId, role }` を付与
- ID Token に乗って Firestore に渡る

### 8.2 ルール構造 (擬似コード)

```
service cloud.firestore {
  match /databases/{db}/documents {

    // ────── 全テナント横断は admin のみ ──────
    function isAdmin()  { return request.auth.token.role == 'admin'; }
    function isMember(tid) { return request.auth.token.tenantId == tid; }
    function isParent() { return request.auth.token.accountType == 'parent'; }
    function isChild()  { return request.auth.token.accountType == 'child'; }
    function myBase()   { return request.auth.token.baseName; }

    // ────── tenants ──────
    match /tenants/{tid} {
      allow read, write: if isAdmin() || isMember(tid);

      match /applicants/{aid} {
        allow read: if isAdmin()
                    || (isMember(tid) && (isParent() || resource.data.base == myBase()));
        allow create: if isAdmin()
                      || (isMember(tid) && (isParent() || request.resource.data.base == myBase()));
        allow update: if isAdmin()
                      || (isMember(tid) && (isParent() || resource.data.base == myBase()));
        allow delete: if isAdmin() || (isMember(tid) && isParent());

        match /stageHistory/{hid} {
          allow read: if isAdmin() || isMember(tid);
          // create のみ許可 (履歴は基本イミュータブル)
          allow create: if isAdmin() || isMember(tid);
          allow update, delete: if isAdmin();  // child は履歴を消せない
        }

        match /files/{fid} {
          allow read, write: if isAdmin()
                              || (isMember(tid) && (isParent() || /* applicant の base 確認 */));
        }
      }

      match /events/{eid} {
        allow read: if isAdmin() || isMember(tid);
        // 子は自拠点の event のみ作成可
        allow create: if isAdmin()
                      || (isMember(tid) && (isParent() || request.resource.data.base == myBase()));
        allow update, delete: if isAdmin()
                              || (isMember(tid) && (isParent() || resource.data.base == myBase()));
      }

      match /messageLogs/{mid} {
        allow read: if isAdmin() || isMember(tid);
        // child は自拠点 applicant に紐づくログのみ
        allow create: if isAdmin() || isMember(tid);  // ※ サーバ側 (Cloud Functions) からの append 推奨
        allow update, delete: if isAdmin();           // 監査保持 (画面からは更新不可)
      }

      // smsLogs / emailLogs / webhookLogs / apiCallLogs / invoices は messageLogs と同等
      match /{logsCol}/{lid} {
        // logsCol in ['smsLogs', 'emailLogs', 'webhookLogs', 'apiCallLogs', 'invoices']
        allow read: if isAdmin() || (isMember(tid) && isParent());
        // create は Cloud Functions 経由を推奨 (status 遷移の整合性、apiCallLogs の改竄防止)
        allow create: if false;
        allow update, delete: if isAdmin();
      }

      match /accounts/{accountId} {
        allow read: if isAdmin() || isMember(tid);
        // 自分のアカウントは自分で update 可 (パスワード変更等)。他アカウントは parent のみ
        allow create, delete: if isAdmin() || (isMember(tid) && isParent());
        allow update: if isAdmin()
                      || (isMember(tid)
                          && (isParent() || request.auth.token.accountId == accountId));
      }

      match /baseOverrides/{baseName} {
        allow read: if isAdmin()
                    || (isMember(tid) && (isParent() || baseName == myBase()));
        // 拠点別オーバーライド書込は parent のみ (child は閲覧のみ)
        allow write: if isAdmin() || (isMember(tid) && isParent());
      }

      match /exclusionList/{eid} {
        allow read: if isAdmin() || isMember(tid);
        // exclusionList の編集は parent のみ (運用ポリシー)
        allow write: if isAdmin() || (isMember(tid) && isParent());
      }

      match /monthlyStats/{ym} {
        allow read: if isAdmin() || isMember(tid);
        // 集計は Cloud Functions 経由のみ
        allow write: if false;
      }

      match /operationLogs/{lid} {
        allow read: if isAdmin() || (isMember(tid) && isParent());
        allow create: if isMember(tid);  // append-only (※ Cloud Functions 経由を強制する場合は false)
        allow update, delete: if false;  // 改竄防止
      }

      match /settings/{doc} {
        allow read: if isAdmin() || isMember(tid);
        allow write: if isAdmin() || (isMember(tid) && isParent());  // child は設定を変更できない (現状仕様)
      }

      match /bases/{baseId} {
        allow read: if isAdmin() || isMember(tid);
        // 拠点 CRUD は parent のみ
        allow write: if isAdmin() || (isMember(tid) && isParent());

        match /slots/{date} {
          allow read: if isAdmin() || isMember(tid);
          // child は自拠点の slot だけ書ける (Calendar の枠数編集)
          allow write: if isAdmin()
                       || (isMember(tid) && (isParent() || /* base ID から baseName 突合 */));
        }
      }
    }

    // ────── admins ──────
    match /admins/{aid} {
      allow read, write: if isAdmin();

      match /operationLogs/{lid} {
        allow read: if isAdmin();
        allow create: if false;        // Cloud Functions 経由のみ (chain hash 強制)
        allow update, delete: if false;
      }
    }

    match /admin/mediaIntegrations/{mid} {
      allow read, write: if isAdmin();
    }
  }
}
```

### 8.3 重要な強制ポイント

| ポイント | 理由 |
|---|---|
| stageHistory の update / delete 禁止 (admin 除く) | 監査ログとして信用できる必要がある |
| operationLogs / messageLogs の write を Cloud Functions 経由に | hash chain (改竄検知) と TTL を server side で強制 |
| child の base 越え書込禁止 | 権限逸脱の最終ガード (画面側でも防いでいるが多重防御) |
| admin の Custom Claim は Firebase Auth admin SDK でのみ付与 | 一般ユーザーが自前で claim を発行できないようにする |
| password / passwordHash は Firestore に持たない | Firebase Auth で完全に管理 |

### 8.4 機微情報の暗号化

| データ | 現状 | Firestore 化時 |
|---|---|---|
| `Source.password` (媒体ログイン情報) | 平文 | Cloud KMS で暗号化、画面表示時は admin / parent のみ復号可。または HashiCorp Vault / Secret Manager 経由 |
| `MediaIntegration.apiKey` | 平文 | 同上 |
| `Anthropic API key` | 環境変数 | Secret Manager。Cloud Functions 内のみアクセス |

---

## 9. Cloud Storage に切り出す添付ファイル設計

### 9.1 現状の問題

- `FileAttachment.url` は base64 inline 想定、5 MB / file の制限
- ClientData が肥大化し localStorage の quota error が頻発
- 共有不可 (コピー時に重複保存される)

### 9.2 Cloud Storage 配置案

```
gs://risotto-files/
  └─ tenants/{tid}/
      └─ applicants/{aid}/
          ├─ {fileId}_resume.pdf
          ├─ {fileId}_photo.jpg
          └─ ...
```

- Firestore: `tenants/{tid}/applicants/{aid}/files/{fileId}` doc に metadata のみ
  ```ts
  interface FileAttachmentDoc {
    name: string;          // 元ファイル名
    size: number;          // bytes
    contentType: string;   // 'application/pdf' 等
    storagePath: string;   // 'tenants/{tid}/applicants/{aid}/{fileId}_resume.pdf'
    uploadedAt: Timestamp;
    uploadedBy: string;    // accountId
  }
  ```
- 画面側: `getDownloadURL(ref(storage, doc.storagePath))` で signed URL を取得

### 9.3 Storage Security Rules

```
service firebase.storage {
  match /b/{bucket}/o {
    match /tenants/{tid}/applicants/{aid}/{fileId} {
      allow read: if request.auth != null
                  && (request.auth.token.role == 'admin'
                      || (request.auth.token.tenantId == tid
                          && (request.auth.token.accountType == 'parent'
                              || /* applicant.base が child の baseName と一致するかを検証 */)));
      allow write: if request.auth != null
                   && (request.auth.token.role == 'admin'
                       || (request.auth.token.tenantId == tid
                           && request.resource.size < 10 * 1024 * 1024)); // 10 MB 制限
    }
  }
}
```

> child の base 一致検証は Storage Rules では難しい (Firestore lookup は Functions 連携が必要)。実装時は Cloud Functions 経由のアップロードに統一して権限判定をサーバ側で実施するのが安全。

### 9.4 移行時の処理

- 各 applicant の `files[].url` (base64 / dataURL / プレースホルダ) を読む
- base64 を decode → Cloud Storage に put → storagePath を取得
- Firestore 側 metadata doc に storagePath を保存
- 古い `files[].url` 値は削除

---

## 10. 引き継ぎメモ (実装担当エンジニアへ)

### 10.1 まず読むべきファイル

> **エントリポイントは `docs/production-handoff-checklist.md`**。本書は設計詳細を担当するが、実装担当が **どの順番で着手するか** はそちらに集約してある。本表は本書本体に沿って読む際の優先度付け。

| 優先度 | ファイル | 内容 |
|---|---|---|
| ★★★ | `docs/production-handoff-checklist.md` | 完了済 / 未完了の境界、推奨 PR 順 (Phase J-1〜J-9)、本番リリース前チェックリスト |
| ★★★ | `src/repositories/README.md` | Repository 設計方針、各フェーズ進捗、transaction 候補一覧 |
| ★★★ | `src/repositories/types.ts` | 全 Repository インターフェース定義 |
| ★★★ | `src/types/index.ts` | 全データ型定義 (`Applicant` / `ClientData` / `Client` 等) |
| ★★★ | `src/services/auth/README.md` | AuthService 境界の進捗と本番認証への切替手順 |
| ★★ | `src/services/auth/types.ts` | AuthService インターフェース |
| ★★ | `src/repositories/localStorage/*.ts` | 既存 LocalStorage 実装 (ロジック踏襲の参考) |
| ★★ | `src/utils/applicantLifecycle.ts` | `withStageChange` / `withCreatedMeta` / `withUpdatedMeta` の純関数群 |
| ★ | `src/utils/storage.ts` | LocalStorage 実装の現状実体 (key 名 / quota error 処理) |
| ★ | `src/contexts/AuthContext.tsx` | 画面側がどう Repository を呼んでいるかの実例 |

### 10.2 実装順 (推奨)

1. **Firebase プロジェクト作成 + Firestore / Auth / Storage 有効化**
2. **`src/repositories/firestore/` ディレクトリ新設、各 Repository を Firestore で実装**
   - 着手順: `clientRepository` → `clientDataRepository` (空実装でも OK) → `applicantRepository` → `eventRepository` → `messageRepository` → `statusRepository` → `reportRepository`
   - **インターフェースを変えない**。既存テスト (なし) / 画面 (27 ファイル) をそのまま動かす
3. **`src/services/auth/firebase/` ディレクトリ新設、`FirebaseAuthService` 実装**
   - `AuthService` interface を満たす。同期 shim (`loginSync` / `restoreSessionSync` 等) は **`throw new Error(...)` で即時失敗**させる方針 (`README.md §I-2a / I-2b`)
   - 画面側の同期 shim 利用は `AuthContext` に集中しているので、AuthContext のみ async 化する PR を 1 本作る
4. **`src/repositories/index.ts` を切替**: 既存 `LocalStorageXxxRepository` インスタンスを `FirestoreXxxRepository` に差し替え
5. **画面側の async 化**: `README.md §3.1` の順 (操作頻度の低い設定画面 → 応募者操作系 → レポート系)
6. **未 Repository 化領域 (§5)** を Firestore 実装で同時に立ち上げ:
   - `BaseRepository.deleteWithCascade` は最重要 (8 配列カスケード)
   - `SlotRepository` は BaseRepository と同時設計
   - 設定系 Repository (Job / Source / EmailTemplate / Hearing / FilterCondition / Screening / Chatbot / MediaCost / ReportSchedule / Exclusion) は段階的に
7. **AdminApp の Firestore 化**: `risotto:admin:*` 4 キーを `/admins` / `/admin/mediaIntegrations` collection に移植
8. **Cloud Functions 整備**: hash chain logs / cascade delete / scheduled batch / API key 暗号化アクセス
9. **マイグレーションツール作成 + 試走** (§7)
10. **本番切替**: hybrid 期間 → LocalStorage 廃棄

### 10.3 必ず守ってほしい点

- **Repository インターフェースを変えない**: 画面側の変更を最小化するため。new field 追加は OK、既存メソッドの戻り値型変更は NG (相談を)。
- **同じ責務名で揃える**: `Firestore...Repository` の各メソッドは `LocalStorage...Repository` と完全同名・同 args・同 戻り値型 (Promise でラップする以外)
- **transaction 化候補は §4 リスト準拠**: 勝手に増やさない / 減らさない (整合性事故が起きる)
- **child の baseName スコープは多重防御**: 画面側 (現状) + Firestore Security Rules (新規) の両方で。どちらかだけにしない
- **password / apiKey は Firestore に書かない**: Firebase Auth / Cloud KMS / Secret Manager で管理
- **stageHistory は append-only**: 過去履歴を update / delete しない (監査保持)
- **operationLogs の write は Cloud Functions 経由に寄せる**: hash chain を信用できる形にする

### 10.4 ハマりポイント候補

| ポイント | 注意 |
|---|---|
| `Applicant.id: number` | Firestore autoId は string。型変更 PR を分離するか、id を string 化する移行が必要 |
| `cancelledAt: '2026/04/30 14:30'` 形式 | `new Date(...)` でパース失敗するブラウザあり。移行時は ISO 化必須 |
| `slotSettings` の 3 階層 map | doc id に `'2026-04-30'` を使う場合、空文字や特殊文字を含むキーがないか移行前に検証 |
| `child.baseName` が `''` のケース | UI 上は許容しているが、Security Rules で `baseName == ''` を許可しないと child が何も読めなくなる |
| `Client.options[key].usageByMonth` の race condition | `incrementOptionUsage` を Firestore `FieldValue.increment(1)` に置換 (LocalStorage では get-modify-set だった) |
| `messageLogs` を applicant doc に内包しない | applicant doc が 1 MB を超えるリスク。必ず別 collection |
| `apiCallLogs` の append 頻度 | AI スクリーニング 1 回毎に 1 doc → コスト要注意。Aggregation を別 collection でキャッシュ |
| `BaseManagement.deleteBase` の cascade 規模 | 拠点に応募者数千件紐付くケースあり。500 doc transaction 上限を超える前提で Cloud Functions 化 |
| `password` リセットメール | 移行時にユーザーに事前周知 (Phase Switch の周知計画必須) |

### 10.5 質問・相談先

- 本書 / `src/repositories/README.md` / `src/services/auth/README.md` を読み込んだ上で疑問が残れば、本リポの Issue に投げる (担当 Claude/Komorinao)
- 既存 transaction 候補リストの解釈・stage 遷移のリーズン体系 (`StageChangeReason`) は `src/types/index.ts:180-187` を参照
- 「これは Repository に寄せるべきか?」の判断は `README.md §3.4` の方針 (1 メソッドに集約 → transaction 化容易) を優先

### 10.6 移行プロジェクトとして決めておくべき項目 (未確定)

下記は本書では決めず、実装担当 + プロダクトオーナーで合意してから実装着手するべき。

#### 10.6.1 環境分離

- Firebase project を `dev` / `staging` / `prod` で分離するか
- LocalStorage 互換の dev project (=本書の hybrid 期間) をどこに置くか
- Cloud Functions / Firestore Rules / index ファイルの GitHub Actions デプロイ可否

#### 10.6.2 Rollback 計画 (hybrid 運用中)

- Firestore 側で破壊的不整合が出た場合に LocalStorage 単独運用へ戻せるか
  - `src/repositories/index.ts` の 1 行差し替えで戻せるが、既に Firestore で書かれた差分は喪失する
- 推奨: hybrid 期間は **Firestore に書きつつ LocalStorage にも書く dual-write モード** を一時的に置き、検証後に LocalStorage を切る順序

#### 10.6.3 データ整合性チェック (移行直後)

- 件数突合: 移行前 LocalStorage の各配列件数 vs Firestore 各 collection の doc 数
- orphan 検出:
  - `applicant.stage` の値が `statuses` 配列に存在するか
  - `event.applicantId` が存在する applicant を指しているか
  - `exclusionList[].applicantId` 同上
  - `applicant.files[].storagePath` が Cloud Storage に実在するか
- stageHistory の monotonicity: `changedAt` が時系列昇順か

#### 10.6.4 Custom Claims セット手順

- 新規 child アカウント追加時:
  - 案 A: 管理画面 (parent) からの登録 → Cloud Functions HTTP API で `auth.setCustomUserClaims` を呼ぶ
  - 案 B: Firebase Auth `onCreate` トリガで Firestore の `accounts/{aid}` を読み、claim を後付け
- baseName 変更時の更新は §4.1 末尾の「child の baseName 変更」項参照
- Force token refresh: claim 変更後は `getIdToken(true)` で即時反映させる

#### 10.6.5 Hash chain サーバ実装の具体仕様

- `src/admin/adminAuth.ts` の FNV-1a 実装をそのまま Cloud Functions に移植
- input: 直前 entry の hash + 新 entry の `(timestamp + operator + category + action + target + detail)` を canonical JSON 化
- output: 新 entry の hash field
- Firestore Security Rules で `create: if false` にし、Cloud Functions 経由のみで append できるようにする (§8.2 既述)
- `tenants/{tid}/operationLogs` も同様の chain を持たせるか、それとも append-only + サーバ署名のみで済ませるかは要決定

#### 10.6.6 PII / 保持期間ポリシー

- `Applicant.dataRetentionUntil` の自動削除頻度: Cloud Scheduler 日次バッチ
- `stageHistory` の retention: 永続保持 or N 年後 archive
- Cloud Storage signed URL の有効期限: 短時間 (10 分等) + 都度発行か、長期 (1 日) + 失効処理か
- 退会済テナント (`status = 'cancelled'`) のデータ保持期間
- GDPR / 個人情報保護法対応: 削除リクエストへの応答経路

#### 10.6.7 CI/CD

- Firebase CLI のデプロイ (`firebase deploy --only firestore:rules,firestore:indexes,functions`) を GitHub Actions に組むか
- `firestore.indexes.json` / `firestore.rules` を本リポにコミットするか別リポに分離するか
- Cloud Functions のテスト戦略: emulator suite を CI に組み込む

#### 10.6.8 Firestore コスト試算 (本書スコープ外だが事前に)

- 想定 read/write QPS、想定テナント数 × 平均応募者数
- `apiCallLogs` の append 頻度 (AI スクリーニング 1 回 = 1 doc) と 1 ヶ月のコスト試算
- レポート画面の `collectionGroup` query のコスト

---

## 11. 付録

### 11.1 主要な型のクロスリファレンス

| 型 | 定義位置 | Firestore マッピング先 |
|---|---|---|
| `Client` | `src/types/index.ts:323` | `tenants/{id}` doc + `tenants/{id}/accounts/{id}` |
| `ClientData` | `src/types/index.ts:544` | 解体して各 collection (§2.2) |
| `Applicant` | `src/types/index.ts:83` | `tenants/{tid}/applicants/{aid}` + subcollections |
| `InterviewEvent` | `src/types/index.ts:215` | `tenants/{tid}/events/{eid}` |
| `Status` | `src/types/index.ts:236` | `tenants/{tid}/statuses/{sid}` |
| `MessageLog` | `src/types/index.ts:673` | `tenants/{tid}/messageLogs/{mid}` |
| `ClientOperationLog` | `src/types/index.ts:282` | `tenants/{tid}/operationLogs/{lid}` |
| `SlotSetting` | `src/types/index.ts:415` | `tenants/{tid}/bases/{bid}/slots/{date}` |
| `FileAttachment` | `src/types/index.ts:1` | `tenants/{tid}/applicants/{aid}/files/{fid}` doc + Cloud Storage |
| `AdminAccount` | `src/admin/AdminApp.tsx:135` | `/admins/{aid}` + Firebase Auth |
| `AdminOperationLogEntry` | `src/admin/adminAuth.ts:122` | `/admins/{aid}/operationLogs/{lid}` (Cloud Functions append) |
| `MediaIntegration` | `src/admin/AdminApp.tsx:154` | `/admin/mediaIntegrations/{mid}` |
| `SafeClient` | `src/services/auth/types.ts` | (画面 state 専用、Firestore 上の保管なし) |

### 11.2 Phase 履歴 (移行前の参考)

完了済 Phase は移行時に「既に Repository / AuthService 経由になっている」=「インターフェース差し替えだけで動く」と読んでよい。

| Phase | 内容 |
|---|---|
| A | applicantRepository.changeStage で reason 付与経路完成 |
| B | ExclusionList 経由の changeStageBulk |
| C | clearStageForDeletedStatus + StatusManagement 移行 |
| D | StatusRepository 立ち上げ + StatusManagement.tsx 移行 |
| E | Repository 非同期化方針 (本書の前提) |
| F | applicantRepository.create に initialStageReason / CSV import 連携 |
| G | applicantRepository.update / delete (cascade) を ApplicantDetail に集約 |
| H | EventRepository 立ち上げ + Calendar / ApplicantDetail 全経路移行 (scheduleInterview / removeWithCancelRecord 含む) |
| I | AuthService 境界 + SafeClient 化 + Client.password optional 化 |
| K | SlotRepository 立ち上げ (K-1) + Calendar.tsx の slotSettings 直書き経路を全 Repository 化 (K-2〜K-4)。K-5 = BaseManagement.deleteBase 連携は Phase L-3 で集約 |
| L | BaseRepository 立ち上げ (L-1) + BaseManagement / Calendar の bases 直書き経路を全 Repository 化 (L-2)。L-3 で `deleteWithCascade` に 8 配列カスケード + child アカウント baseName クリアを集約 (K-5 を同時消化) |
| M | ClientRepository に CRUD 5 API 追加 (M-1)。AccountSettings の 4 callsite を Repository 経由に (M-2)。BaseRepository.deleteWithCascade の child baseName クリアを `detachChildBaseName` 経由に (M-3)。AdminApp.loadClients を `list()` 経由に (M-4)。AdminApp.handleToggleStatus / onUpdateClient prop 内部を `findById/update/list` 経由に (M-5a)。AdminApp.handleSave を `create/update` 経由に (M-5b、child companyName 追従を `listChildren` + `update` で維持)。AdminApp.handleDelete を `delete` 経由に (M-6、clientData/operationLogs は orchestrator 残置)。AuthService に `adminResetPassword` 追加 + AdminApp.handleUpdatePassword を経由に (M-7a)。`clientOptions.incrementOptionUsage` を `findById/update` 経由に (M-7b)。BaseManagement の削除確認 child 件数取得を `listChildren` 経由に (M-8)。**クライアント系 `storage.getClients/saveClients` 直叩きはコードベースから完全消滅** |

### 11.3 未着手 (本書を踏まえて優先度を決める)

| 優先度 | 項目 |
|---|---|
| ★★★ | 設定系 Repository (Job / Source / EmailTemplate / Hearing / FilterCondition / Screening / Chatbot / MediaCost / Exclusion)。BaseRepository / SlotRepository / ClientRepository は Phase L / K / M で完了済 |
| ★★★ | AdminApp 系 Repository + Firestore 化（AdminAccount / AdminLog / MediaIntegration の 3 系統。ClientRepository は M-1〜M-8 で完了済のため対象外） |
| ★★ | Firestore 化時の残注意: password は Firebase Auth 側で管理（Firestore に書かない）。`clientData / operationLogs` の delete は orchestrator / Cloud Functions の subcollection 再帰削除候補。`saveAll` 経由の adminResetPassword は Firebase Auth Admin SDK / Cloud Functions に置換 |
| ★ | Cloud Functions による operationLogs / messageLogs の append 強制 |
| ★ | createMany (CSV 大量取込最適化) |
| ★ | dataRetentionUntil バッチ削除 / cancellationDate auto-inactive バッチ |

### 11.4 本書の補足対応履歴

- v1 初版: 全章
- v1.1 レビュー反映 (2026-05-10):
  - §2.3: `usageByMonth` の `FieldValue.increment` 方針 / root doc にフラット保持の明示を追記
  - §4.1: child の baseName 変更 (Firestore + Custom Claims 同時更新) を transaction 候補に追加
  - §4.3: AdminAccount ロックアウト / `incrementOptionUsage` を batch カテゴリに明記
  - §5.4.1: ClientRepository の `create / update / delete` 補完を新規節として追加
  - §7.1.2: `hireflow:client:${id}:logs` / `risotto:admin:*` 系の移行先を変換表に追記
  - §8.2: `accounts / baseOverrides / exclusionList / monthlyStats / smsLogs ほかログ系` の Security Rules を追加
  - §10.6: 移行プロジェクトとして合意すべき未確定項目 (環境分離 / rollback / 整合性チェック / Custom Claims / hash chain / PII / CI/CD / コスト) を新節として追加
- v1.2 整合性レビュー反映 (2026-05-10):
  - §4.4: Cloud Functions 必須候補に Custom Claims 付与 / 更新を追加 (`handoff §5.3` と同期)
  - §10.1: エントリポイントとして `docs/production-handoff-checklist.md` を最上位に追加
- v1.3 Phase K 完了反映 (2026-05-10):
  - §5.1: SlotRepository を 未着手 → ✅ 完了 (K-1〜K-4) に更新。確定 API + Firestore マッピング (`bases/{baseId}/slots/{date}` の `capacities` map field, WriteBatch を date 単位でグルーピング) を追記
  - §5.5: 完了 Repository 表に `slotRepository` を追加
  - §11.2: Phase 履歴に K を追加
  - §11.3: 未着手リストから SlotRepository を除外 (BaseRepository は ★★★ に残す)。K-5 = BaseManagement 連携のみ BaseRepository フェーズで対応する旨を注記
- v1.4 Phase L 完了反映 (2026-05-10):
  - §5.2: BaseRepository を 未着手 → ✅ 完了 (L-1〜L-3) に更新。確定 API (`list / get / findByName / create / update / deleteWithCascade`) と `DeleteBaseCascadeResult` の 10 フィールドを反映。`computeRemoveBasePatch` を slotRepository / baseRepository で共有する設計を追記
  - §5.5: 完了 Repository 表に `baseRepository` を追加
  - §11.2: Phase 履歴に L を追加 (K-5 = BaseManagement 連携の同時消化を明記)
  - §11.3: 未着手リストから BaseRepository を除外。最優先 ★★★ を「設定系 Repository 群」に繰り上げ
  - §12 (README): BaseRepository 専用節を README に新設し、設計判断 (id 採番 / 同値 no-op / アトミック性 / updatedAt 非 touch / pure helper 共有 / saveClients 直叩きの理由) と Firestore 化方針 / 残タスク (rename カスケード) を集約
- v1.5 Phase M-1〜M-3 反映 (2026-05-11):
  - §5.4.1: ClientRepository CRUD 補完を ✅ M-1 完了に更新。確定 API（create / update / delete / listChildren / detachChildBaseName）+ password 案 A（型レベル除外）+ delete cascade 境界（clients 配列のみ、clientData / operationLogs / Firebase Auth は orchestrator 側）+ M-4〜M-7 残タスクを明記
  - §5.5: 完了 Repository 表の `clientRepository` 行を「Phase 1 + Phase M-1」に拡張（残タスクとして M-4〜M-7 を併記）
  - §11.2: Phase 履歴に M を追加（M-1=API 追加 / M-2=AccountSettings / M-3=BaseRepository 経由置換）
  - §11.3: 未着手リストから ClientRepository CRUD を除外。AdminApp 系を ★★★ に繰り上げ（M-4〜M-7 を内包）
  - §12 (README §12.3.6): L-3 時点の「`storage.saveClients` 直叩き」を M-3 で `clientRepository.detachChildBaseName` 経由に置換した旨に書き換え
  - README §13: ClientRepository（Phase M）専用節を新設（責務範囲 / API 一覧 / 6 つの設計判断 / Firestore 化方針 / 移行履歴 M-1〜M-7 / 残タスク）
- v1.6 Phase M-4〜M-8 完了反映 (2026-05-11):
  - §5.4.1: ClientRepository CRUD 補完を「M-1〜M-8 すべて完了」に更新。AdminApp 全 callsite (loadClients / handleToggleStatus / onUpdateClient / handleSave / handleDelete / handleUpdatePassword) + `clientOptions.incrementOptionUsage` + BaseManagement 削除確認の child 件数取得をすべて Repository / authService 経由に置換完了。設計判断ブロックも M-1〜M-8 確定事項に書き換え、`saveAll` を「authService.adminResetPassword 内部のみが呼ぶ限定 API」に縮退、完了内訳 (M-1〜M-8) を新設
  - §5.5: 完了 Repository 表の `clientRepository` 行を「Phase 1 + Phase M（M-1〜M-8 完了。クライアント系 storage 直叩きは全消滅）」に更新
  - §11.2: Phase M 行を M-1〜M-8 すべて完了に書き換え。「クライアント系 `storage.getClients/saveClients` 直叩きはコードベースから完全消滅」を明記
  - §11.3: 未着手リストから ClientRepository M-4〜M-7 を完全除外。AdminApp 系 ★★★ から ClientRepository を除き、AdminAccount / AdminLog / MediaIntegration の 3 系統のみに整理。Firestore 化時の残注意（password は Firebase Auth、clientData/logs delete は orchestrator/Cloud Functions、`saveAll` 経路は Admin SDK / Cloud Functions 置換）を ★★ 行として追加
  - README §13: 移行履歴 §13.5 を M-1〜M-8 完了内訳に更新。残タスク §13.6 を「`saveAll` 撤去（Firestore 化時）」「Firestore 実装本体」「`findForLogin` 撤去」「delete cascade orchestrator 側の Firestore 化時の移管先」に整理。§13.3.1 と §13.3.6 を M-7a / M-8 完了状態に書き換え。§7 進捗表に M-4〜M-8 行を追加

---

**設計書終わり。** 実装着手前に本書 + `src/repositories/README.md` + `src/services/auth/README.md` を通読し、不明点は事前に確認してください。
