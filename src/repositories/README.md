# Repositories — 非同期化方針

このディレクトリは画面・フックから「保存先（localStorage / Firestore / Cloud SQL / Sheets 等）」を隠蔽するための Repository 層。
将来 Google DB（Firestore 等）に移行する前提で、本ドキュメントは **同期/非同期 API の取り扱い方針** を明文化する。

> **本ドキュメントはルールであり、実装変更ではない。** Phase E ではコードに手を入れない。今後新しい Repository / API を追加するとき、および既存の async 化を行うときに従う。

---

## 1. 現状

- `localStorage` 実装はすべて同期 API（戻り値は `T`、`Promise<T>` ではない）
  - 例: `applicantRepository.list(clientId): Applicant[]`
  - 例: `applicantRepository.changeStage(...): Applicant | undefined`
- 将来導入予定の Firestore / Cloud SQL / Sheets はネットワーク I/O を伴う **async API** になる
  - `getDoc` / `setDoc` / `runTransaction` 等は `Promise<T>` を返す
- 既存画面（ApplicantDetail / ApplicantList / KanbanBoard / 各 Settings / RecruitmentReport 等）は同期前提で書かれている
  - 戻り値を直接 state に当てる
  - `if (!updated) return;` のような同期パターン
  - `useEffect` で `loadClientData()` を 1 回呼ぶだけ
- **今すぐ全 API を `Promise<T>` 化すると、ほぼ全画面に `await` / loading / error 対応の改修が走り、レビュー困難な大コミットになる**

---

## 2. 方針（採用案: 段階移行）

### 2.1 既存 API は当面同期のまま維持
- すでに同期で書かれている API（`list`, `get`, `create`, `update`, `changeStage`, `changeStageBulk`, `clearStageForDeletedStatus` 等）は変えない
- これらは Firestore 移行時にまとめて async 化するが、それまでは触らない
- 既存呼び出し側（画面コード）の改修も発生しない

### 2.2 新規 Repository API は async 化しやすい責務境界にする
- 戻り値の型は **同期で返せる形** に書きつつ、後で `Promise<T>` にしても呼び出し側の論理が壊れにくい設計を選ぶ
  - ✅ 単一の集約結果を返す（例: `BulkStageChangeResult { updatedCount, skipped }`）
  - ❌ 中間 callback で部分結果をストリームする（async 化時に AsyncIterator が必要になる）
- **複数データを同時に変更する責務は 1 つの Repository メソッドに閉じ込める**
  - 例: `changeStageBulk` は 1 メソッド内で全 patch を適用 → 1 回 save
  - 例: `clearStageForDeletedStatus` は stage クリアと stageHistory 掃除を 1 メソッドで実施
  - 将来の Firestore 化で `runTransaction` / バッチ write に 1:1 で置き換えやすい
- 戻り値で「変更件数」「skip 理由」を返す API は async 化後も同じ shape のまま `Promise<T>` 化できる

### 2.3 画面側は対象画面ごとに段階的に async 化する
- バックエンド差し替え時、画面 1 つずつ以下を導入していく:
  - `await applicantRepository.changeStage(...)`
  - loading state（ボタン無効化、スピナー）
  - error handling（toast / モーダル / 復元）
  - 必要なら optimistic update
- 一括 Promise 化はしない（影響範囲が制御できないため）

### 2.4 Repository 内部で保存先を隠蔽する
- 画面コードは `applicantRepository.xxx(...)` の形で呼び、内部実装が `localStorage` か Firestore かを意識しない
- 切替えは `src/repositories/index.ts` の 1 ファイル差し替えで済ませる:
  ```ts
  // 現在
  export const applicantRepository = new LocalStorageApplicantRepository();
  // 移行時
  export const applicantRepository = new FirestoreApplicantRepository();
  ```

---

## 3. 推奨パターン

### 3.1 1 画面ずつ async 対応する
- まず最も操作頻度の低い設定画面（StatusManagement / ExclusionList / FilterConditionSettings）から async 化
- 次に応募者操作系（ApplicantList / KanbanBoard / ApplicantDetail）
- 最後にレポート系（RecruitmentReport）

### 3.2 大規模一括 Promise 化は避ける
- 「全 Repository を Promise<T> に揃える PR」を 1 つで作らない
- レビュー困難・rollback 困難・テスト網羅性低下を招く

### 3.3 localStorage 版と Firestore 版で同じ責務名を保つ
- 同じインターフェース `ApplicantRepository` の 2 実装にする
- メソッド名・引数・戻り値 shape を揃える
- インターフェース側で Promise<T> | T のユニオンに揃える時は、既存呼出側を 1 箇所ずつ async 化していけるよう per-method で進める

### 3.4 複数データを同時更新する処理は transaction/batch write に置き換えやすい API に寄せる

すでに該当する API:

| API | 責務 | Firestore 化時の置換先 |
|---|---|---|
| `applicantRepository.changeStageBulk` | 複数 applicant の stage + active を 1 回で変更し履歴を残す | `runTransaction` / `WriteBatch` |
| `applicantRepository.clearStageForDeletedStatus` | 全 applicants の stage / stageHistory を掃除 | `runTransaction` / `WriteBatch` |

新規追加する Repository API でも、**「画面側が複数 update 呼出を順に書く」のではなく、Repository メソッド 1 つに集約する** ことを優先する。

### 3.5 reason / operator は今後も必須化を維持
- `BulkStageChangeOptions.operator` / `reason` は必須型
- 監査・集計の前提なので、async 化しても shape は変えない

---

## 4. 注意点

### 4.1 2 段 save のある処理は Firestore 化時に transaction 候補

現状 LocalStorage 同期 API のため事実上アトミックだが、Firestore に移行すると 2 回の write 間で失敗する窓ができる。下記は transaction 化候補:

| 処理 | 現状の 2 段 save | transaction 化方針 |
|---|---|---|
| `ExclusionList.addEntry` | Step1: `updateClientData` で exclusionList 追加 / Step2: `changeStageBulk` で applicants 一括除外 | exclusionList 追加と applicants 更新を 1 transaction に統合（または 1 Repository メソッドに集約） |
| `StatusManagement.deleteStatus` | Step1: `updateClientData` で statuses 削除 / Step2: `clearStageForDeletedStatus` | `removeStatusWithCascade(name)` 1 メソッドにまとめる |
| `ApplicantDetail.handleScheduled` (H-5 で集約済) | 1 回の `saveClientData` で events 追加 + applicants[].stage / stageHistory / stageChangedAt / updatedAt を同時更新（`eventRepository.scheduleInterview`） | Firestore 化時は events doc 追加 + applicant doc 更新を `runTransaction` で原子化。詳細は §10.4 |
| `ApplicantDetail.handleCancelEvent` (H-4 で集約済) | 1 回の `saveClientData` で events 削除 + applicants[].cancelledInterviews append（`eventRepository.removeWithCancelRecord`） | Firestore 化時は events doc 削除 + applicant doc 更新を `runTransaction` で原子化（cancelledInterviews を applicant 内包する設計なら必須） |
| `ApplicantDetail.handleDelete` (G-2 で集約済) | 1 回の `saveClientData` で applicants / events / exclusionList を同時 filter | Firestore 化時は applicant doc 削除 + 関連 events / exclusionList の cleanup を `runTransaction` / `WriteBatch` / Cloud Functions の server-side cascade いずれかで吸収する候補。詳細は §9.2 |

これらは **Phase E 時点では現状維持**。Firestore 化のフェーズで 1 メソッドに集約 + transaction 化する。

### 4.2 UI 側は async 化時に optimistic update / loading / error 表示を検討

LocalStorage 時代は「保存即反映」だったが、async 化すると以下の選択を画面ごとに行う:

- **optimistic update**: state 先行更新 → 失敗時 rollback
  - KanbanBoard の D&D 等、操作のテンポが重要な画面で採用
- **pessimistic update**: await 完了後に state 反映
  - 設定系画面で十分
- **loading**: ボタン disabled + スピナー
- **error**: toast / モーダル / 元状態復元

### 4.3 localStorage キーは移行完了まで維持
- `hireflow:client:${id}:data` 等のキーを変えない
- Firestore 移行時に 1 度だけマイグレーションスクリプトで Firestore に流し込む
- 並行運用期間（hybrid）を作る場合も、書き込み先を切り替えるだけで済むよう Repository 経由を徹底する

### 4.4 SMS / メール本送信は本リポでは扱わない
- `MessageLog` / `MessageRepository` / 連絡履歴表示 / ドライランログ作成 は維持
- 実送信は別エンジニア担当の別リポジトリで実装される

---

## 5. スコープ外（明示）

- 本ドキュメントでは **実装変更を行わない**
- Firestore / Cloud SQL / Sheets の実装は今回追加しない
- 既存 API を `Promise<T>` 化しない
- 既存 React コンポーネントの async 化を行わない
- StatusRepository など新規 Repository の追加もしない（別フェーズ）

---

## 6. StatusRepository の方針補足（D-1 で追加）

`StatusRepository` は Status 定義の CRUD / 並び替え / サブステータス操作を提供する。設計指針:

- **name ベース参照**: 削除・並び替え・サブステ操作は `name` 引数で指定する。`applicants.stage` / `stageHistory` が name ベースで保持されているため整合させる
- **applicants カスケードは含めない**: `remove(name)` は statuses 配列からの削除のみ。applicants 側の stage / stageHistory 掃除は呼び出し側で `applicantRepository.clearStageForDeletedStatus(name)` を併用する（履歴を残す処理 vs 掃除する処理の責務分離。Phase C と同じ方針）
- **変更がなければ save しない**: 該当なし / 同名重複 / 端での moveOrder / 内容完全一致の upsert などは no-op
- **`save(statuses[])`**: テンプレート一括適用や並び替え結果保存用。差し替え意図を尊重して常に save する
- **applyTemplate は未実装**: Status 配列を組み立てて `save(...)` を呼べば代替できるため、Repository に専用 API は当面持たない（必要になった時点で追加）

D-2 で StatusManagement.tsx の `updateClientData` 直叩きを本 Repository 経由に置換完了。`deleteStatus` は `statusRepository.remove` + `applicantRepository.clearStageForDeletedStatus` の 2 段呼出になるが、Firestore 化時は 1 transaction にまとめる候補（Section 4.1 参照）。

**id ベース UI と name ベース Repository の橋渡し方針（D-2 実装済）**

- 単純操作（toggleActive / moveOrder / addSubStatus / removeSubStatus / remove）は呼び出し直前で `statuses.find((s) => s.id === id)?.name` により name を解決して Repository を呼ぶ
- rename を含む可能性がある操作（saveStatus 編集モード）と、新リスト構築済みの操作（applyTemplate / saveStatus 新規追加）は `save(list)` で全差し替え
- これにより `StatusRepository` は name ベース API のまま、画面の id ベース UI を変えずに移行できた

---

## 7. 進捗トラッキング

| Phase | 内容 | 状態 |
|---|---|---|
| A | 単一経路に reason 付与 | ✅ 完了 |
| B | ExclusionList.addEntry → changeStageBulk | ✅ 完了 |
| C | clearStageForDeletedStatus + StatusManagement.deleteStatus 移行 | ✅ 完了 |
| E | 本ドキュメント（非同期化方針） | ✅ 完了（このファイル） |
| D-1 | StatusRepository 型 + LocalStorage 実装（画面未連携） | ✅ 完了 |
| D-2 | StatusManagement.tsx を StatusRepository 経由に置換 | ✅ 完了 |
| F-1 | ApplicantList.tsx の CSV 取込を applicantRepository.create 経由に置換 | ✅ 完了 |
| F-2 | applicantRepository.create に initialStageReason オプション追加 + CSV 明示 stage 行に csv_import 履歴付与 | ✅ 完了 |
| **G-1** | **ApplicantDetail.updateApplicant を applicantRepository.update 経由に置換（10 callsite 共通化、差分計算で no-op 保護）** | **✅ 完了** |
| **G-2** | **ApplicantDetail.handleDelete を applicantRepository.delete 経由に置換（applicants/events/exclusionList カスケードを Repository 内に閉じ込め）** | **✅ 完了** |
| **H-1** | **EventRepository 型 + LocalStorage 実装（listByApplicant / listByDateRange / create / remove / removeWithCancelRecord / scheduleInterview。画面未連携）** | **✅ 完了** |
| **H-2** | **Calendar.handleBook / handleCancelEvent を eventRepository.create / remove 経由に置換** | **✅ 完了** |
| **H-3** | **ApplicantDetail.handleReschedule を eventRepository.remove 経由に置換** | **✅ 完了** |
| **H-4** | **ApplicantDetail.handleCancelEvent を eventRepository.removeWithCancelRecord 経由に置換（events 削除 + cancelledInterviews append を 1 saveClientData に集約）** | **✅ 完了** |
| **H-5** | **ApplicantDetail.handleScheduled を eventRepository.scheduleInterview 経由に置換（events 追加 + stage='面接確定' 遷移を 1 saveClientData に集約。withStageChange を直接利用）** | **✅ 完了** |
| **K-1** | **SlotRepository 型 + LocalStorage 実装（listBase / getDay / getCapacity / setCapacity / bulkSetCapacity / removeBase。画面未連携）** | **✅ 完了** |
| **K-2** | **Calendar.setSlotCapacity を slotRepository.setCapacity 経由に置換（同値 no-op 維持）** | **✅ 完了** |
| **K-3** | **Calendar.bulkSetAllSlots を slotRepository.bulkSetCapacity 経由に置換（weekdaysOnly 判定は呼出側で維持）** | **✅ 完了** |
| **K-4** | **Calendar.handleBulkApply を slotRepository.bulkSetCapacity 経由に置換（Calendar.tsx の slotSettings 直書き経路を完全消滅）** | **✅ 完了** |
| **L-1** | **BaseRepository 型 + LocalStorage 実装（list / get / findByName / create / update / deleteWithCascade。`computeRemoveBasePatch` を slotRepository.ts に切出して共有）。画面未連携** | **✅ 完了** |
| **L-2** | **BaseManagement.save / Calendar.saveBaseSettings を baseRepository.create / update 経由に置換（rename 非カスケードの既存挙動を維持。logAction / モーダル制御は呼出側に残す）** | **✅ 完了** |
| **L-3** | **BaseManagement.deleteBase を baseRepository.deleteWithCascade 経由に置換（8 配列カスケード + child accounts.baseName クリアを Repository 内に集約。logAction の detail は戻り値フィールドから組み立て）。K-5 を同時消化** | **✅ 完了** |
| **M-1** | **ClientRepository 型 + LocalStorage 実装に CRUD 5 API 追加（create / update / delete / listChildren / detachChildBaseName）。password は型レベルで update から除外、delete は parent 削除時に child cascade、clientData / operationLogs / Firebase Auth は触らない。画面未連携** | **✅ 完了** |
| **M-2** | **AccountSettings の会社情報保存 / メンバー追加・削除・通知 toggle を clientRepository.findById + update 経由に置換（4 callsite → storage 直叩き消滅）。password 変更経路は authService.changePassword のまま（I-3）** | **✅ 完了** |
| **M-3** | **baseRepository.deleteWithCascade の child アカウント baseName クリアを clientRepository.detachChildBaseName 経由に置換（baseRepository から `storage.getClients/saveClients` 直叩きを根絶。0 件時 no-op、戻り値 detachedCount は DeleteBaseCascadeResult.detachedChildAccountCount にマップ）** | **✅ 完了** |
| **M-4** | **AdminApp.loadClients を `clientRepository.list()` 経由に置換（運営画面の初期読込から `storage.getClients` 直叩きを除去）** | **✅ 完了** |
| **M-5a** | **AdminApp.handleToggleStatus / onUpdateClient prop 内部を `clientRepository.findById / update / list` 経由に置換。prop シグネチャ（呼出側 API）は維持** | **✅ 完了** |
| **M-5b** | **AdminApp.handleSave を `clientRepository.create / update` 経由に置換。親 companyName 変更時の child companyName 追従は `listChildren` + `update` で維持。password は `update` patch から strip されるため専用経路（authService.adminResetPassword）以外で変更されない** | **✅ 完了** |
| **M-6** | **AdminApp.handleDelete を `clientRepository.delete` 経由に置換（parent 削除時の child cascade を Repository 内に集約）。`clientData (hireflow:client:{id}:data)` / `operationLogs (hireflow:client:{id}:logs)` の削除は AdminApp orchestration として呼出側に残す** | **✅ 完了** |
| **M-7a** | **AuthService に `adminResetPassword(clientId, newPassword)` を追加 + LocalStorageAuthService に実装。AdminApp.handleUpdatePassword を `authService.adminResetPassword` 経由に置換。ClientRepository は password を扱わない方針を維持。SafeClient / sessionStorage に password を出さない経路を再確認** | **✅ 完了** |
| **M-7b** | **`src/utils/clientOptions.ts` の `incrementOptionUsage` を `clientRepository.findById / update` 経由に置換。`storage.getClients/saveClients` 直叩きを除去（dynamic import は AuthContext → clientOptions → repositories の起動順循環回避のため維持）** | **✅ 完了** |
| **M-8** | **BaseManagement の削除確認ダイアログ用 child 件数取得を `clientRepository.listChildren` 経由に置換。BaseManagement.tsx 内の `storage` 直叩き消滅** | **✅ 完了** |
| **N-1** | **JobRepository 型 + LocalStorage 実装（list / create / update / deleteWithCascade / removeBaseOverride）+ JobManagement.tsx の `updateClientData` 直更新を Repository 経由に置換。jobs / jobsByBase の形状を維持。設定系 Repository 化（Phase N）の参照実装（base-override 型）** | **✅ 完了** |
| **N-2** | **SourceRepository 型 + LocalStorage 実装 + SourceManagement.tsx の `updateClientData` 直更新を Repository 経由に置換。N-1 JobRepository の base-override 型を機械的に横展開（`sources` / `sourcesByBase` + `applicants[].src` カスケード）。Source 型・データ形状・UI・文言は無変更** | **✅ 完了** |
| **N-3** | **EmailTemplateRepository 型 + LocalStorage 実装 + EmailTemplateManagement.tsx の `updateClientData` 直更新を Repository 経由に置換。N-1/N-2 と同じ base-override 型だが cascade なし（applicants 触らない）。1000ms debounce auto-save は呼出側責務として既存挙動維持。EmailTemplate 型・データ形状・UI・文言・auto-save タイミングは無変更** | **✅ 完了** |
| **N-4** | **HearingRepository 型 + LocalStorage 実装（list / upsert のみ）+ HearingManagement.tsx の `updateClientData` 直更新を Repository 経由に置換。base-override なし / jobName キー型 / cascade なし / 削除 API なし。800ms debounce auto-save + 手動保存ボタンは呼出側責務として既存挙動維持。HearingTemplate 型・データ形状・UI・文言・debounce タイミングは無変更** | **✅ 完了** |
| **N-5** | **既存 reportRepository を拡張（getReportSchedule / saveReportSchedule を追加）。ReportScheduleSettings.tsx の `updateClientData` 直更新を Repository 経由に置換。singleton 設定型 / 保存ボタン式 / debounce なし。新規 ReportScheduleRepository は作らず recruitmentGoals と同居（Firestore `/tenants/{tid}/settings/global` doc 設計と整合）。ReportScheduleSetting 型・データ形状・UI・文言・DEFAULT_SETTING・email validation は無変更。lastRunAt / lastRunStatus / lastRunError は将来サーバー配信エンジン用で N-5 では専用 API を作らない（読取り経路のみ提供）** | **✅ 完了** |
| **N-6** | **ExclusionRepository 型 + LocalStorage 実装（list / add / remove）+ ExclusionList.tsx の `updateClientData` 直更新を Repository 経由に置換。base-override なし / tenant 全体共有 / dedup 判定（email lowercase / phone strip / name_birth exact）を Repository 内に集約。add 成功後の `applicantRepository.changeStageBulk` 連携は画面側 orchestrator として維持。applicantRepository.delete 内の `applicantId?` 一致 cleanup は据え置き（cleanupByApplicantId 等は ExclusionRepository に作らない）。ExclusionEntry 型は無変更（`applicantId?` は旧データ互換隠しフィールドのまま）** | **✅ 完了** |
| **N-7** | **MediaCostRepository 型 + LocalStorage 実装（getAll / saveDraft / removeSource）+ MediaCostManagement.tsx の `updateClientData` 2 箇所を Repository 経由に置換。ネストマップ型 `[ym][src] -> number` を扱う初の N-7 ケース。parseAmount（全角→半角 / カンマ・空白除去 / 1〜1 億円範囲）/ 月キー pruning / invalidCount 集計を Repository 内に集約。saveDraft は partial merge（draft に含まれない月/cell は触らない）/ 全 cell no-op の場合は saveClientData を呼ばない。removeSource は媒体名で全月横断 cascade 削除。Source rename/delete と mediaCosts の連動は pre-existing orphan として据え置き（別フェーズ）** | **✅ 完了** |
| **N-8** | **FilterConditionRepository 型 + LocalStorage 実装（getLegacy / getByBaseMap / getEffective / updateForBase）+ FilterConditionSettings.tsx の `updateClientData` 直更新を Repository 経由に置換。base 別 `filterConditions[baseName]` のみを更新し、legacy `filterCondition` は読み取り fallback 専用（書換 API なし）。fallback 解決ロジック（base 別 → legacy → defaultFC）を Repository 内に集約。`applicantRepository.changeStageBulk(..., reason:'filter_condition_applied')` 連携は画面側 orchestrator として維持。AddApplicantModal / ApplicantList / AdminApp の legacy 直接参照はスコープ外として現状維持** | **✅ 完了** |
| — | applicantRepository.delete 内 events filter を eventRepository へ責務移譲 | 未着手（cascade service 整理時に再検討） |
| — | InfoTab に渡している updateClientData prop の Repository 化 | ✅ H-5 で削除（未使用 dead pipeline）。将来書込が必要になったら専用 Repository 経由で再追加 |
| — | applicantRepository.createMany（大量取込最適化） | 未着手（必要時に追加） |
| — | AddApplicantModal の duplicate back-prop を Repository 経由に | 未着手（updatedAt 副作用評価が必要） |
| — | Firestore 実装本体 | 未着手（別タスク） |
| — | UI 上の予約 / キャンセル / 再調整モーダルの完全な手動確認（H-2〜H-5 は Repository 直接呼出で等価カバレッジを取得済） | 推奨（リリース前回帰テストで実施） |

> **Phase の分け方**:
> - **Phase J 系**: Firestore / Firebase Auth / Cloud Storage への実装本体差し替え。詳細は `docs/production-handoff-checklist.md` を参照。本番リリース前チェックリストも同 handoff に集約
> - **Phase N 系**: 設定系画面の Repository 化（LocalStorage のまま責務境界を引き直す）。対象は Job / Source / EmailTemplate / Hearing / FilterCondition / Screening / Chatbot / MediaCost / ReportSchedule / Exclusion の 10 種。Phase J 着手前に責務境界を確定させておくことで、Firestore 化時の作業が「実装差し替え 1 ファイルだけ」に収まる。N-1 = JobRepository / N-2 = SourceRepository / N-3 = EmailTemplateRepository / N-4 = HearingRepository / N-5 = ReportSchedule（既存 reportRepository 拡張） / N-6 = ExclusionRepository / N-7 = MediaCostRepository / N-8 = FilterConditionRepository 完了。詳細は §14 を参照

---

## 8. ApplicantRepository.create の `opts` 仕様（F-2 で追加）

`applicantRepository.create(clientId, applicant, opts?)` は新規応募者の作成時に分析用メタ情報と「初期 stage 履歴」を任意で付与するためのフックを持つ。CSV インポート由来の応募者と、UI からの単体追加を **同じ Repository API** で扱いつつ、Firestore 化したときに 1 doc.set へ自然にマップできるよう設計している。

### 8.1 opts の意味

| フィールド | 型 | 意味 |
|---|---|---|
| `initialStageReason` | `StageChangeReason?` | 初期 stage を stageHistory に「明示的に記録された遷移」として残す理由ラベル。指定時のみ履歴エントリが追加される |
| `operator` | `string?` | stageHistory.operator に記録する操作者表示名。空文字ならエントリの `operator` フィールドを省略する（既存 `withStageChange` と同等の扱い） |

### 8.2 stageHistory 付与ルール

- **`opts.initialStageReason` が指定され、かつ `applicant.stage` が非空**のときに限り、`stageHistory` に 1 件 push する:

  ```ts
  {
    stage,
    toStage: stage,
    changedAt: stageChangedAt,
    reason: opts.initialStageReason,
    operator?: opts.operator,
  }
  ```

- `fromStage` は付けない（前段が無いため）
- `opts` 未指定 / `opts.initialStageReason` undefined / `applicant.stage` 空文字 のいずれかなら **履歴は作らない**（既存挙動と同じ）
- `createdAt` / `updatedAt` / `stageChangedAt` の自動付与は opts 指定の有無に関わらず常に実行される（`withCreatedMeta` の責務）

### 8.3 CSV インポートでの呼び分け方針

`ApplicantList.doImport` では、CSV 行ごとに「stage が明示されていたか」を判定して呼出を分岐する:

| CSV「ステータス」列の状態 | 解釈 | create 呼出 |
|---|---|---|
| 値あり（trim 後に文字列が残る） | ユーザー/CSV が **明示した選考状態** | `create(ownerId, applicant, { initialStageReason: 'csv_import', operator })` |
| 空欄 → `statuses[0]?.name` にフォールバック | システム上の **初期値**（ユーザー意図ではない） | `create(ownerId, applicant)` (opts 未指定) |

この区別は、採用レポートのリードタイム集計などで「実際の選考状態として観測されたかどうか」を判定するために重要。フォールバック行を履歴に積んでしまうと「初期値が選考の最初のステージ通過」と誤計上される恐れがある。

### 8.4 既存呼出との互換

- AddApplicantModal の単体追加経路は `applicantRepository.create(ownerId, applicant)` を **opts 未指定** で呼ぶ（F-2 で **触っていない**）
- opts は optional + default `{}` で実装されているため、既存呼出は型・挙動とも完全互換
- CSV 取込以外で「初期 stage 履歴を残したい」要件が出たら、新たな `StageChangeReason` 列挙値を追加して同じ opts 経路で対応する想定

### 8.5 大量取込（createMany）への発展余地

- 現状は CSV N 行 → `create` を N 回呼ぶ → localStorage save が N 回発生する
- 数十〜数百件の運用想定では許容範囲
- 1000 件超の取込が要件化したタイミングで `createMany(clientId, items, opts)` を追加する想定。各 item に `applicant` と任意の `initialStageReason` を持たせれば「行ごとに履歴付与可否を切替」できる
- `createMany` を追加した場合でも `create` の opts 仕様は維持する（呼出側が選べるようにする）

### 8.6 Firestore 化時の判断ポイント

`stageHistory` の永続化形態によって `create` の実装方針が変わる:

| 形態 | `create` の書き方 | transaction の必要性 |
|---|---|---|
| applicant doc に **embedded array** として持つ | 1 回の `setDoc(applicantRef, { ...applicant, stageHistory: [entry] })` | 不要 |
| applicants/{id}/stageHistory **subcollection** に分ける | 親 doc 作成 + サブコレクション 1 件追加の **2 write** | `runTransaction` 推奨（途中失敗時に親だけ作られるのを避ける） |

LocalStorage 実装は embedded array 前提（`applicant.stageHistory: StageHistoryEntry[]`）。Firestore 移行時に subcollection 化する場合、`create` を `runTransaction` でラップする必要がある。Section 4.1 の transaction 候補一覧にも本パターンを追加候補として持つ:

| 処理 | 現状 | Firestore 化時の方針 |
|---|---|---|
| `applicantRepository.create` (opts.initialStageReason 指定時) | LocalStorage 内で 1 回 save | embedded array なら不要 / subcollection なら transaction |

### 8.7 設計判断: なぜ `withStageChange` を使わなかったか

`withStageChange(applicant, toStage)` は `fromStage === toStage` を no-op で返す仕様（履歴汚染防止）。CSV インポートでは `applicant.stage` を初期値として持つため、`create` で stage='X' を入れた直後に `changeStage('X', ...)` を呼んでも何も起きない。これを回避するには:

- 案 A: `create` で stage='' にしてから `changeStage('X')` で stage と履歴を立てる（2 段 save）
- **案 B（採用）**: `create` 内で stageHistory に直接 push（1 段 save、API 拡張）
- 案 C: `createMany` API を新設（API 新設、別フェーズ）

案 B を採った理由は §8.5 / §8.6 と整合（save 回数最小・Firestore 1 doc.set 化容易・既存 API 互換）。案 A は 2 段 save が transaction 候補に増えるため避けた。

---

## 9. ApplicantDetail 通常編集／削除経路の Repository 化（Phase G）

`ApplicantDetail.tsx` の通常編集 (`updateApplicant`) と削除 (`handleDelete`) は長らく `updateClientData` 直叩きが残っていたが、Phase G で Repository 境界に寄せた。stage 遷移は既に `applicantRepository.changeStage` 経由（Phase A 系）に移行済みのため、本節は **非 stage の編集** と **削除カスケード** に焦点を当てる。

### 9.1 Phase G-1: `updateApplicant` を `applicantRepository.update` 経由に

`ApplicantDetail` 内の `updateApplicant(updater)` は 10 箇所の callsite から呼ばれる単一 applicant の更新ヘルパ（needsAction 切替 / メモ自動保存 / 編集フォーム保存 / サブステータス変更 / 一次面接結果 / スクリーニング結果 / ファイル添付・削除 / 求人情報保存）。G-1 では callsite API を維持したまま内部実装だけ差し替えた。

実装方針:

- callsite の updater 関数 API は不変（10 callsite を 1 行も変えない）
- 内部で `next = updater(applicant)` を作り、`applicant` との差分のみ `Partial<Applicant>` として `applicantRepository.update(ownerId, applicant.id, patch)` に渡す
- 差分が空なら `update` を呼ばず no-op（`withUpdatedMeta` の不要発火防止）
- stage キーが差分に混入した場合は `console.warn` で検出 + patch から strip（stage 変更は `changeStage` 経路に分離）
- 完了後に `reloadClientData()` で AuthContext を再読込（子アカウントの拠点フィルタも再適用される）

副作用:

- `update` 経由になることで `withUpdatedMeta` が常に走るため、変更があった callsite では `updatedAt` が自動更新される（旧 `updateClientData` 直叩きでは未更新だった）
- 並び替えや「最終更新」表示に `updatedAt` を使う箇所では「常に最新時刻」になる方向への変化のみで、欠損方向の事故は起きない

### 9.2 Phase G-2: `applicantRepository.delete` 新設 + `handleDelete` 集約

応募者削除のカスケードを Repository 内に閉じ込めるため `ApplicantRepository.delete(clientId, applicantId): DeleteApplicantResult` を新設した。

カスケード対象:

- **applicants** から `applicantId` 一致を除去（screening / files / stageHistory / chatAnswers / cancelledInterviews は applicant オブジェクト内包なので一緒に消える）
- **events** から `applicantId` 一致を全削除（関連する面接イベント）
- **exclusionList** から `applicantId` 一致を全削除（除外リストの applicantId 参照エントリ。applicantId フィールドが無い旧データエントリは残る）

カスケード対象外（既存挙動維持）:

- **messageLogs** は `ClientData.messageLogs` に同居しているが意図的に削除しない。応募者削除と同時に連絡履歴を消すと監査・問い合わせ対応で支障が出るため、既存の `handleDelete` と同じ「孤児として残す」挙動を踏襲する。将来カスケード対象に含めるかは別議論

戻り値 `DeleteApplicantResult`:

```ts
{
  deletedApplicant: boolean;       // applicants から実際に除去されたか
  deletedEventCount: number;       // events から削除した件数
  clearedExclusionCount: number;   // exclusionList から削除した件数
}
```

LocalStorage 実装は 3 配列を 1 回の `saveClientData` にまとめて書き込むことで、既存 `handleDelete` と同等のアトミック性を保つ。3 配列のいずれにも変更がなければ save を呼ばない（無駄な write を避ける）。

`ApplicantDetail.handleDelete` 側の責務は以下のみに縮約:

1. `applicantRepository.delete(ownerId, applicant.id)` を呼ぶ
2. `reloadClientData()` で AuthContext を再読込
3. `logAction('applicant', '応募者削除', ...)` で操作ログを残す
4. `setDeleteConfirm(false)` / `onBack` / URL クリアで UI フローを完了させる

### 9.3 Firestore 化時の方針

Firestore は cascade delete を持たないため、`delete` を 1 メソッドに集約しておくことが移行時の前提になる。実装方針の候補:

- **`runTransaction` / `WriteBatch`**: applicants / events / exclusionList が同一 collection 階層なら、削除対象を query で集めて 1 transaction で削除する
- **server-side cascade**: applicant 削除を Cloud Functions / API でフックし、関連データを backend 側で cleanup する（クライアント実装はシンプルなまま保てる）
- **subcollection 化**: `applicants/{id}/events` 等の subcollection 構造を採るなら親 doc の再帰削除関数で代替できる

いずれの方針でも、画面側 (`ApplicantDetail.handleDelete`) は `applicantRepository.delete(ownerId, applicantId)` 1 呼出のままで済むよう、戻り値とエラーハンドリングのインターフェースを変えずに置換できる設計にしてある。

### 9.4 残タスクと次フェーズ候補

`ApplicantDetail.tsx` 内に残る `updateClientData` 直叩きは以下:

| ハンドラ | 何を書いているか | 次フェーズ候補 |
|---|---|---|
| `handleScheduled` (events push 部分) | events 配列に 1 件追加 | EventRepository 設計とセット |
| `handleCancelEvent` | events filter + applicants[].cancelledInterviews append | EventRepository 設計とセット（applicant 側 append は G-1 経由化の余地あり） |
| `handleReschedule` | events filter | EventRepository 設計待ち |
| `InfoTab` に渡している `updateClientData` prop | 子コンポーネント側調査 | 別フェーズ |

EventRepository が立ち上がるまで上記は据え置く（events 配列操作の責務を 1 箇所にまとめる時に同時に async 化候補とする）。SMS / メール本送信は本リポの対象外（§4.4）。

> **状態更新（2026-05-10）**: 上表 4 行のうち上 3 行は Phase H で順次 EventRepository 経由に移行完了。詳細は §10。InfoTab 側の `updateClientData` pass-through は H-5 で未使用が判明し削除済み（将来書込要件が出たら専用 Repository 経由で再追加）。

---

## 10. EventRepository（Phase H）

`InterviewEvent` 配列と、それに連動する applicant 側の状態変化（stage 遷移 / cancelledInterviews 追加）を扱う Repository。LocalStorage では `ClientData.events: InterviewEvent[]` を直接書き換えていた経路（Calendar / ApplicantDetail）を集約する。

### 10.1 責務範囲

- **events 配列の CRUD**: `listByApplicant` / `listByDateRange` / `create` / `remove`
- **applicant 連動を伴う複合書込**: `removeWithCancelRecord` / `scheduleInterview`（いずれも 1 saveClientData で events / applicants を同時更新）
- **slotSettings は含めない**: 面接枠定義は別ライフサイクル（base に紐づきカスケード削除される）。将来 `SlotRepository` を別 Repository として独立させる方針（§10.6）

### 10.2 API 一覧

```ts
interface EventRepository {
  // 読み取り
  listByApplicant(clientId: string, applicantId: number): InterviewEvent[];
  listByDateRange(clientId: string, params?: ListEventsByDateRangeParams): InterviewEvent[];

  // 書き込み（基本）
  create(clientId: string, event: Omit<InterviewEvent, 'id'> & Partial<Pick<InterviewEvent, 'id'>>): InterviewEvent;
  remove(clientId: string, eventId: number): RemoveEventResult;

  // 書き込み（複合 = transaction 候補）
  removeWithCancelRecord(clientId: string, eventId: number, applicantId: number): RemoveWithCancelRecordResult;
  scheduleInterview(
    clientId: string,
    applicantId: number,
    event: Omit<InterviewEvent, 'id'> & Partial<Pick<InterviewEvent, 'id'>>,
    options: { operator: string; reason: 'interview_scheduled' },
  ): ScheduleInterviewResult;
}
```

### 10.3 設計判断

#### 10.3.1 `scheduleInterview` を 1 saveClientData に集約（H-5）

events 追加と applicant.stage='面接確定' 遷移を **同一 `storage.saveClientData` 呼出** にまとめている。旧実装は `eventRepository.create(...)` → `applicantRepository.changeStage(...)` の 2 段 save で、LocalStorage では事実上アトミックでも Firestore 化時の transaction 化候補として残っていた。H-5 で `withStageChange` を直接 pure 利用する形に再構成し、events / applicants を 1 write にまとめた。

- `withStageChange(applicant, '面接確定', { operator, reason })` は **same-stage で同一参照を返す** ため、`next !== prev` で no-op 判定可能（履歴汚染なし）
- 既に '面接確定' の場合: events のみ追加、applicants は変更しない、`updatedApplicant: undefined` を返す
- 新規遷移の場合: stage / stageHistory / stageChangedAt / updatedAt をまとめて反映、`updatedApplicant: Applicant` を返す
- reason は型レベルで `'interview_scheduled'` リテラル固定（誤用防止）

この設計は §3.4 の方針「複数データを同時更新する処理は transaction/batch write に置き換えやすい API に寄せる」と整合する。

#### 10.3.2 `removeWithCancelRecord` で cancelledInterviews を集約（H-4）

events 削除と applicant.cancelledInterviews append を 1 saveClientData にまとめる。`cancelledAt` の locale 文字列生成（`new Date().toLocaleString('ja-JP')`）も Repository 内部で行う。**stage / stageHistory / updatedAt は触らない**（既存 `handleCancelEvent` 挙動互換）。

#### 10.3.3 Calendar からの予約は stage を変えない（H-2 仕様維持）

`eventRepository.create` は events 追加のみ、`eventRepository.scheduleInterview` だけが stage を触る、と API 名で挙動を区別する。Calendar.handleBook（拠点側オペレータの直予約）は applicant.stage を変えない既存仕様を尊重し、stage 遷移を伴うのは ApplicantDetail.handleScheduled（応募者詳細からの予約）のみとする。仕様統一が必要になったら別フェーズで議論する。

#### 10.3.4 Repository 内部の依存方針

- H-1 当初は `LocalStorageEventRepository` 内部で `LocalStorageApplicantRepository` を直接 new していた（シングルトン循環参照回避のため）
- H-5 で `withStageChange` を直接 pure 利用する設計に変えたことで、ApplicantRepository への依存を削除
- 結果: EventRepository は `storage` + `withStageChange` のみに依存（Firestore 移行時は storage 部分を Firestore SDK に差し替えるだけ）

### 10.4 Firestore 化時の方針

| メソッド | LocalStorage 実装 | Firestore 化時 |
|---|---|---|
| `create` / `remove` | `storage.saveClientData` 1 回 | `setDoc` / `deleteDoc` 1 回。transaction 不要 |
| `removeWithCancelRecord` | `storage.saveClientData` 1 回 | events doc 削除 + applicant doc 更新の `runTransaction`。cancelledInterviews を applicant doc に内包する設計なら必須 |
| `scheduleInterview` | `storage.saveClientData` 1 回（H-5 で集約済） | events doc 追加 + applicant doc 更新の `runTransaction`。途中失敗で「予約はあるのに stage が前のまま」状態を防ぐ |
| `listByApplicant` / `listByDateRange` | events 配列を全件 filter | Firestore query（`where('applicantId', '==', id)` / `where('date', '>=', from)`）に置換 |

`InterviewEvent.id` は LocalStorage で `max + 1` の number 採番。Firestore 化時に string ID（autoId）へ移行するなら `InterviewEvent.id: string` への型変更 + 既存 number id を string 化するマイグレーションが必要（既存画面の `event.id === eventId` 比較が number 前提）。

### 10.5 残タスク（Phase H 範囲内では着手しない）

- **SlotRepository**: ✅ Phase K-1〜K-4 で完了。Calendar.tsx の `setSlotCapacity` / `bulkSetAllSlots` / `handleBulkApply` は `slotRepository` 経由に置換済（§11 参照）。`slotRepository.removeBase` も実装済だが BaseManagement.deleteBase 側からの呼出（K-5）は BaseRepository フェーズで対応予定
- **BaseManagement.deleteBase の events / slotSettings / 多段カスケード**: 未移行（events / bases / applicants(base クリア) / slotSettings / jobsByBase / sourcesByBase / emailTemplatesByBase / filterConditions の 8 配列を 1 saveClientData で同時更新）。BaseRepository フェーズで集約予定。SlotRepository 側は `removeBase` を提供済のため、BaseRepository から呼ぶだけで slotSettings 部分は責務移譲できる
- **applicantRepository.delete 内の events filter**: G-2 で applicantRepository が events を直接 filter する責務を持っている。将来 `eventRepository.removeByApplicant(clientId, applicantId)` を新設して責務を移譲する余地あり。循環依存に注意（applicantRepository → eventRepository を呼ぶと EventRepository.scheduleInterview の `withStageChange` 経路と組合せた場合に依存方向が複雑化）
- **UI 上の予約 / キャンセル / 再調整モーダルの完全な手動確認**: H-2〜H-5 はいずれも Repository 直接呼出で等価カバレッジを取得済（ScheduleInterviewModal / cancel confirm modal は無変更）。リリース前回帰テストでの対話フロー確認を推奨

### 10.6 SlotRepository を分けた理由（参考）

EventRepository に slotSettings を含めなかった主な理由:

1. **ライフサイクルが違う**: events は applicant に紐づき `applicantRepository.delete` でカスケード / slotSettings は base に紐づき `BaseManagement.deleteBase` でカスケード
2. **アクセスパターンが違う**: events は applicantId / 日付範囲 / base で query / slotSettings は base 名 + 日付 + 時刻の 3 階層 map lookup
3. **同時更新が発生しない**: Calendar 上で同居しているが、operator のクリック単位で別ハンドラ（予約 / 枠数編集）
4. **API 形状が大きく違う**: events は CRUD + listByXxx の素直な形 / slotSettings は「3 階層 map の 1 セル更新」「N 件一括更新」など特殊な形
5. **Firestore 設計でも別 collection が自然**: events は `applicants/{id}/events` (subcollection) または top-level `events/{id}` / slotSettings は `bases/{baseId}/slots/{date}` など

SlotRepository は当初「BaseRepository と同時設計の別フェーズで立ち上げる方針」としていたが、Calendar.tsx 側の slotSettings 直書き経路（3 ハンドラ）が独立して責務分離可能と判断し、Phase K-1〜K-4 で先行実装した。BaseRepository フェーズでは `BaseManagement.deleteBase` から `slotRepository.removeBase` を呼ぶだけで slotSettings カスケード部分は責務移譲できる状態（K-5）。詳細は §11 を参照。

---

## 11. SlotRepository（Phase K）

`SlotSetting`（拠点 → 日付 → 時刻 → 枠数 の 3 階層 map）を扱う Repository。LocalStorage では `ClientData.slotSettings: { [baseName]: { [date]: { [time]: number } } }` を直接書き換えていた経路（Calendar.tsx）を集約する。

### 11.1 責務範囲

- **slotSettings の CRUD**: `listBase` / `getDay` / `getCapacity` / `setCapacity` / `bulkSetCapacity` / `removeBase`
- **同値書込・空変更を検知して save を抑制**: 無駄な `saveClientData` を呼ばない（§11.3.2）
- **events は含めない**: 面接イベントは `EventRepository`（§10）の責務
- **拠点削除カスケードは部分的**: `removeBase` メソッドは提供するが、`BaseManagement.deleteBase` の 8 配列カスケード本体は `BaseRepository` 側の責務（K-5）。SlotRepository は slotSettings 部分の単独削除 API として提供する

### 11.2 API 一覧

```ts
interface SlotRepository {
  // 読み取り
  listBase(clientId: string, baseName: string): SlotSetting;
  getDay(clientId: string, baseName: string, date: string): SlotDayCapacity;
  getCapacity(clientId: string, baseName: string, date: string, time: string): number;

  // 書き込み（基本）
  setCapacity(
    clientId: string,
    baseName: string,
    date: string,
    time: string,
    capacity: number,
  ): void;

  // 書き込み（一括）
  bulkSetCapacity(
    clientId: string,
    baseName: string,
    cells: SlotBulkPatch[],
  ): BulkSetCapacityResult;

  // カスケード削除（BaseRepository から呼ぶ用）
  removeBase(clientId: string, baseName: string): RemoveBaseSlotsResult;
}

interface SlotBulkPatch {
  date: string;     // YYYY-MM-DD
  time: string;     // HH:MM
  capacity: number;
}

interface BulkSetCapacityResult {
  updatedCellCount: number;     // 実際に書き換えたセル数
  unchangedCellCount: number;   // 同値で skip したセル数
}

interface RemoveBaseSlotsResult {
  removed: boolean;             // 該当 baseName が存在したか
  removedDateCount: number;     // 削除した日付エントリ数
}
```

### 11.3 設計判断

#### 11.3.1 listBase + getDay + getCapacity の 3 階層 read API

Calendar の UI は時刻セル単位（`getCapacity`）から週表示（`listBase`）まで読み出し粒度が幅広い。3 階層すべてに read API を持たせて、画面側で必要な粒度を選べるようにした。Firestore 化時は `bases/{baseId}/slots/{date}` doc から `capacities` map field を引く形になり、`getDay` は 1 doc.get、`listBase` は collection query、`getCapacity` は `getDay` の field 抽出と素直にマップできる。

#### 11.3.2 同値 no-op で saveClientData を抑制

`setCapacity` は `prev === capacity` のとき `saveClientData` を呼ばず early return する。`bulkSetCapacity` も `updatedCellCount === 0` なら save を呼ばない。Calendar 上で同じ枠数を再クリック / 一括設定で既に同値だったケースで無駄な write を発生させない。LocalStorage では quota 圧迫防止、Firestore では doc write コスト削減につながる。

#### 11.3.3 bulkSetCapacity の per-date shallow merge

`bulkSetCapacity` は cells を date ごとにグルーピングしながら shallow merge する。同一 date に対する `cells[]` 内の複数エントリは「最後勝ち」で集約。一方、cells に含まれない time キーは元の値を保持する（破壊的上書きをしない）ため、「同じ日の別時刻枠を編集中に bulk apply しても他時刻の値を消さない」セマンティクスを担保する。

Firestore 化時は date 単位で WriteBatch にグルーピング:

```ts
// 擬似コード
for (const date of Object.keys(grouped)) {
  batch.update(doc(`bases/${baseId}/slots/${date}`), {
    [`capacities.${time}`]: capacity,
    // ...
  });
}
```

`FieldValue` を使って map field の部分更新を活用すれば、他時刻キーを破壊せず指定 time だけ書き換えられる。

#### 11.3.4 removeBase は実装済だが画面未連携（K-5）

K-1 で `removeBase` を実装したが、`BaseManagement.deleteBase` 側の `updateClientData` 直叩きはまだ残っている。理由は **8 配列カスケードのアトミック性を維持するため**で、SlotRepository.removeBase だけ先に呼ぶと bases / applicants / events / slotSettings / jobsByBase / sourcesByBase / emailTemplatesByBase / filterConditions が部分更新状態になる窓ができる。BaseRepository フェーズで `baseRepository.deleteWithCascade` を立ち上げ、その内部で `slotRepository.removeBase` を呼ぶ構造に集約する予定（K-5）。

### 11.4 Firestore 化時の方針

| メソッド | LocalStorage 実装 | Firestore 化時 |
|---|---|---|
| `listBase` | `data.slotSettings[baseName]` 全体を返す | `tenants/{tid}/bases/{baseId}/slots` collection を query。doc 単位で `{ date, capacities }` を組み立てて 3 階層 map に再構成 |
| `getDay` | `data.slotSettings[baseName]?.[date]` を返す | `tenants/{tid}/bases/{baseId}/slots/{date}` doc.get → `capacities` field をそのまま返す |
| `getCapacity` | 3 階層 lookup | `getDay` の結果から time キーを抽出（または doc field の selective read） |
| `setCapacity` | 1 セル書込 | `update(doc, { ['capacities.' + time]: capacity })` で map field の 1 キーのみ更新。doc 不存在なら `set({ capacities: { [time]: capacity } }, { merge: true })` |
| `bulkSetCapacity` | 1 saveClientData で全 cells 書込 | date ごとにグルーピング → WriteBatch で各 date doc を update。500 cells 超は WriteBatch chunk |
| `removeBase` | `delete data.slotSettings[baseName]` | `tenants/{tid}/bases/{baseId}/slots` collection を全 doc delete。500 doc 超は Cloud Functions に分離 |

### 11.5 残タスク

- **K-5（✅ Phase L-3 で消化）**: `BaseManagement.deleteBase` の slotSettings 部分は `baseRepository.deleteWithCascade` 内で `computeRemoveBasePatch` 経由に集約済。`slotRepository.removeBase` 自体は L-3 でも単独 API として維持しているが、画面側の連携は BaseRepository に集約された
- **UI 上の枠数編集 / 一括適用 / 平日のみ開放の手動回帰確認**: K-2〜K-4 はいずれも Repository 経由で等価カバレッジを取得済（同値 no-op / bulk merge / 空 cells early return 含む）。リリース前の対話フロー確認を推奨

---

## 12. BaseRepository（Phase L）

`Base`（拠点）配列と、その削除に伴う **8 配列 + child アカウント baseName** のカスケードを扱う Repository。LocalStorage では `BaseManagement.tsx` / `Calendar.tsx` から `updateClientData` 直叩きで書いていた経路を集約する。

### 12.1 責務範囲

- **bases 配列の CRUD**: `list / get / findByName / create / update`
- **拠点削除カスケード**: `deleteWithCascade` で以下を 1 メソッドに集約
  - `ClientData` 側 7 配列（bases / applicants[].base クリア / events filter / slotSettings[name] / jobsByBase[name] / sourcesByBase[name] / emailTemplatesByBase[name] / filterConditions[name]）を **1 saveClientData** に統合
  - 別 storage（`hireflow:clients`）の child アカウント `baseName` クリアを **1 saveClients**（変化があった場合のみ発火）
- **rename カスケードは含めない**: `update` で `name` を変えても他配列（applicants[].base / events.base / slotSettings キー など）は追従しない（既存 BaseManagement と互換）。仕様変更が必要なら別フェーズで議論

### 12.2 API 一覧

```ts
interface BaseRepository {
  list(clientId: string): Base[];
  get(clientId: string, baseId: number): Base | undefined;
  findByName(clientId: string, baseName: string): Base | undefined;
  create(clientId: string, base: Omit<Base, 'id'>): Base;
  update(clientId: string, baseId: number, patch: Partial<Omit<Base, 'id'>>): Base | undefined;
  deleteWithCascade(clientId: string, baseId: number): DeleteBaseCascadeResult;
}

interface DeleteBaseCascadeResult {
  removed: boolean;                          // bases 配列に該当 id が存在し、削除したか
  removedBaseName?: string;                  // 削除した base の name（logAction の詳細用）
  clearedApplicantBaseCount: number;         // applicants[].base を '' にクリアした件数
  removedEventCount: number;                 // events から削除した件数
  removedSlotDateCount: number;              // slotSettings[name] から消えた日付エントリ数
  removedJobsByBase: boolean;                // jobsByBase[name] が存在して削除されたか
  removedSourcesByBase: boolean;
  removedEmailTemplatesByBase: boolean;
  removedFilterCondition: boolean;
  detachedChildAccountCount: number;         // baseName をクリアした child アカウント数
}
```

### 12.3 設計判断

#### 12.3.1 id 採番は `max(bases.id) + 1`

`create` 内部で既存配列の id 最大値 + 1 を採番（`Calendar.handleBook` / 既存 BaseManagement と同方式）。Firestore 化時は autoId（string）に切替予定（§7.2 ID 型変更）。

#### 12.3.2 update は同値書込で no-op

patch に含まれるキーすべてが既存値と一致すれば `saveClientData` を呼ばず early return する。`Calendar.saveBaseSettings` / `BaseManagement.save`（編集モード）からの再保存で無駄な write を発生させない。`patch.id` が紛れ込んでも握りつぶす。

#### 12.3.3 deleteWithCascade のアトミック性

8 配列の cascade を `data` を 1 度だけ読み出し、すべての差分を組み立ててから **1 saveClientData** で書き込む。`saveClients` は detachedChildAccountCount > 0 の場合のみ追加で呼ぶ（不要 write 回避）。LocalStorage では同期 API のため事実上アトミック。Firestore 化時は §4.1 / §12.4 のとおり Cloud Functions 経由が前提。

#### 12.3.4 applicants[].base クリア時に updatedAt を touch しない

既存 `BaseManagement.deleteBase` 互換。`withUpdatedMeta` を経由しない直接マージで、応募者の最終更新時刻を不必要に書き換えない。Repository 化後も同じ挙動を維持。

#### 12.3.5 slotSettings 部分は `computeRemoveBasePatch` を共有

`slotRepository.ts` に切り出した pure helper `computeRemoveBasePatch(slotSettings, baseName)` を baseRepository から直接 import して呼ぶ。これにより:

- `slotRepository.removeBase` を単独 API として残しつつ、`baseRepository.deleteWithCascade` 内では同じロジックを 1 saveClientData の中に組み込める
- 二重 saveClientData が発生しない（slotRepository.removeBase を baseRepository から呼ぶと slotSettings だけ別 save になり、8 配列カスケードのアトミック性が崩れる）

#### 12.3.6 child アカウント baseName クリアは `clientRepository.detachChildBaseName` 経由（M-3 で置換済）

L-3 時点では循環依存懸念から `storage.saveClients` 直叩きにしていたが、M-1 で ClientRepository 自体が `storage` 以外の Repository に依存しない設計であることが確定したため、M-3 で `clientRepository.detachChildBaseName(clientId, baseName)` 経由に置換。

- `accountType === 'child' && parentId === clientId && baseName === baseName` の判定責務は ClientRepository に集約
- 0 件時の no-op（saveClients 未呼出）も ClientRepository 内部に内包
- 戻り値 `detachedCount` を `DeleteBaseCascadeResult.detachedChildAccountCount` にマップ（フィールド名・値とも L-3 時点と互換）
- BaseRepository は `LocalStorageClientRepository` インスタンスをフィールドで保持。Firestore 化時は DI（コンストラクタ inject）に切替予定

### 12.4 Firestore 化時の方針

| メソッド | LocalStorage 実装 | Firestore 化時 |
|---|---|---|
| `list` | `data.bases ?? []` | `tenants/{tid}/bases` collection を query |
| `get` | `bases.find(b => b.id === id)` | `tenants/{tid}/bases/{baseId}` doc.get |
| `findByName` | `bases.find(b => b.name === name)` | `tenants/{tid}/bases` を `where('name', '==', name)` で query。一意性は client / Cloud Functions 側で担保 |
| `create` | `max(id) + 1` 採番 + saveClientData | `addDoc(...)` で autoId。返り値の `Base.id` を string 化 |
| `update` | shallow merge + 同値 no-op | `updateDoc(doc, patch)`。同値 no-op は client 側で残してコスト削減 |
| `deleteWithCascade` | 1 saveClientData + 1 saveClients | **Cloud Functions 経由が現実的**。8 collection / doc 横断削除 + Custom Claims 更新（child の baseName クリア時は `auth.setCustomUserClaims` の更新が必要）。500 doc 上限を超える可能性があるため、サーバ側で reduce する。詳細は `firestore-design.md §4.4` |

#### 12.4.1 transaction / Cloud Functions 候補

- **`baseRepository.deleteWithCascade`**: 8 配列 cascade。`firestore-design.md §4.1` の必須 transaction 候補に既に列挙済。Cloud Functions に分離するのが安全
- **child アカウントの baseName クリア**: accounts doc 更新 + Firebase Auth Custom Claims 更新の 2 系統。Cloud Functions で順次 + idempotent 再実行（`firestore-design.md §4.1` / §10.6.4 参照）

### 12.5 残タスク

- **rename カスケード**: 現状は `update` で name 変更しても他配列（applicants[].base / events.base / slotSettings / *ByBase / filterConditions / child accounts.baseName）は追従しない。仕様変更が必要なら別フェーズで「`renameWithCascade(clientId, baseId, newName)`」を新設する想定（現状要件として上がっていないため未実装）
- **Firestore 実装本体**: §12.4 の表どおりの Firestore 版実装。`tenants/{tid}/bases/{baseId}` collection + `slots/{date}` subcollection + Cloud Functions cascade
- **UI 上の拠点作成 / 編集 / 削除の手動回帰確認**: L-2 / L-3 はいずれも Repository 直接呼出 + UI 経由の双方で等価カバレッジを取得済（rename / detach 子アカウント / 8 配列削除を含む）。リリース前の対話フロー確認を推奨

---

## 13. ClientRepository CRUD 補完（Phase M）

`Client`（運営側のクライアント企業アカウント / 子アカウント）配列 `hireflow:clients` の CRUD を集約する Repository。Phase I で `findById / findForLogin / saveAll` が先行整備されていたが、M-1 で **画面側 callsite を寄せるための 5 API** を追加し、M-2 で AccountSettings、M-3 で BaseRepository が `storage.getClients/saveClients` 直叩きを卒業した。続いて M-4〜M-7 で AdminApp の全 callsite（loadClients / handleToggleStatus / onUpdateClient / handleSave / handleDelete / handleUpdatePassword）と `clientOptions.incrementOptionUsage`、M-8 で BaseManagement の削除確認 read-only 経路を Repository / authService 経由に集約し、**クライアント系 storage 直叩きを完全消滅**させた。`saveAll` は現状 `authService.adminResetPassword` 内部（password 更新は `update` で strip されるため saveAll 経由が必要）と互換維持目的の限定用途のみ。

### 13.1 責務範囲

- **clients 配列の CRUD**: `create / update / delete / listChildren / detachChildBaseName`（M-1）
- **password を扱わない**: 変更・リセット・照合は `authService.changePassword / adminResetPassword` の責務。`update` の patch 型から `password` を除外（型レベルで誤書き込みを静的にブロック）
- **delete のスコープ限定**: `clients` 配列の操作のみ。`clientData (hireflow:client:{id}:data)` / `operationLogs (hireflow:client:{id}:logs)` / Firebase Auth ユーザーの削除は **AdminApp orchestrator 側の責務** として明確に分離
- **他 Repository に依存しない**: ClientRepository は `storage` のみ参照。BaseRepository / ApplicantRepository などからは inject 可能（循環依存なし）

### 13.2 API 一覧

```ts
interface ClientRepository {
  // 既存（Phase I 系）
  list(): Client[];
  findById(id: string): Client | undefined;
  findForLogin(id: string, password: string): Client | undefined; // 互換維持、authService 内部のみ利用
  saveAll(clients: Client[]): void; // 全件差し替え（互換、新規 callsite では使わない）

  // M-1 で追加
  create(client: Client): Client; // 同 id 衝突時は既存を返し no-op（idempotent）
  update(
    id: string,
    patch: Partial<Omit<Client, 'id' | 'password'>>,
  ): Client | undefined; // 同値 no-op、id 不在は undefined
  delete(id: string): DeleteClientResult;
  listChildren(parentId: string): Client[];
  detachChildBaseName(parentId: string, baseName: string): DetachChildBaseNameResult;
}

interface DeleteClientResult {
  removed: boolean;                   // clients 配列に該当 id が存在し、削除したか
  deletedChildAccountCount: number;   // parent 削除時の child cascade 件数（child 削除時は常に 0）
}

interface DetachChildBaseNameResult {
  detachedCount: number;              // baseName=undefined にした child アカウント数（0 なら save 未呼出）
}
```

### 13.3 設計判断

#### 13.3.1 password 案 A 採用（ClientRepository は password を扱わない）

`update` patch から `password` を型で除外。AdminApp.handleUpdatePassword は M-7a で `authService.adminResetPassword`（新 API）経由に置換済。LocalStorage 期は `Client.password` 自体は保持されるが、書込経路は authService の 1 箇所に集約されている（`adminResetPassword` 内部のみが `clientRepository.saveAll` で password を含む全件差し替えを行う。`update` 経路では実行時にも保険として strip）。

理由:
- 平文 password を画面コードから完全排除（Phase I-5 で `Client.password` を optional 化済、本フェーズで書込側もブロック）
- Firestore 化（J-3）時は password 自体を Firestore に保存しない設計（Firebase Auth に分離）。書込経路が 1 本化されていればこの切替が 1 ファイル差分で完結
- `findForLogin` は歴史的経緯で残しているが authService 内部からのみ呼ばれる

#### 13.3.2 create は id 衝突で idempotent

`create(client)` で同 id が既に存在する場合は既存 Client を返し `saveClients` を呼ばない。AdminApp.handleSave で衝突するケースは現状ないが、防御的にこの挙動。例外 throw にしない理由は呼出側が衝突をユースケース化していないため（M-5 で AdminApp 寄せ込み時に挙動見直し可）。

#### 13.3.3 update は同値書込で no-op

patch のキーすべてが既存値と一致すれば `saveClients` を呼ばず early return。AccountSettings の toggle 系（notifyEmail / notifySms）で意図せず同値書込が発生した場合に無駄な書込を回避する。`id` / `password` が patch に紛れ込んでも実行時に剥がす（型 + 実行時の二重防御）。

#### 13.3.4 delete cascade は clients 配列のみ

`delete(id)` の責務は `clients` 配列から該当 id を除去すること + parent 削除時に配下 child を同時除去すること。**`clientData` / `operationLogs` / Firebase Auth ユーザー削除は呼ばない**。

理由:
- ClientRepository の責務は `clients` のみ。`clientData` の削除は `clientDataRepository.delete`、`operationLogs` キー削除は AdminApp orchestrator、Firebase Auth は `authService.deleteAccount` と、各 Repository / Service の責務分離
- Firestore 化時もこのカスケード境界が活きる（`tenants/{tid}` doc 削除 = Cloud Functions、Firebase Auth = `auth.deleteUser`、operationLogs = subcollection 個別削除）

#### 13.3.5 listChildren / detachChildBaseName は parent 起点

`parentId` 引数を必須にし、grand-parent / sibling ツリーは見ない。`accountType === 'child'` フィルタで親候補は除外。BaseRepository.deleteWithCascade のような cascade 利用と、AdminApp / AccountSettings の参照系の両方で同じ API を使える。

#### 13.3.6 全 callsite が置換されたら saveAll は撤去候補

`saveAll(clients)` は Phase I 互換維持のため M-1 でも残している。M-4〜M-8 で AdminApp / clientOptions / BaseManagement の `storage.saveClients/getClients` 直叩きが消えたため、現在 `saveAll` の callsite は **`authService.adminResetPassword` 内部の 1 箇所のみ**（password 更新は `update` で型・実行時の双方で strip されるため saveAll 経由が必須）。Firestore 化（J-5）時は `adminResetPassword` 自体が Firebase Auth Admin SDK / Cloud Functions に切替わるため、`saveAll` も同時に撤去される見込み。

### 13.4 Firestore 化時の方針

| メソッド | LocalStorage 実装 | Firestore 化時 |
|---|---|---|
| `list` | `storage.getClients()` | `tenants` collection を query（権限ありユーザーのみ・運営画面用） |
| `findById` | `clients.find(c => c.id === id)` | parent → `tenants/{tid}` doc.get、child → query 経由 or 親 tid + childId 解決 |
| `findForLogin` | 平文照合 | **撤去候補**。Firebase Auth に責務移行（authService 経由） |
| `create` | append + saveClients | parent: `setDoc(tenants/{tid}, {...})` / child: `setDoc(tenants/{parentTid}/accounts/{accountId}, {...})`。Firebase Auth ユーザー作成は Cloud Functions or authService.createAccount 経由 |
| `update` | shallow merge + 同値 no-op | `updateDoc(doc, patch)`。同値 no-op は client 側で維持 |
| `delete` | filter + saveClients | parent: Cloud Functions で `tenants/{tid}` subcollection 全削除（500 doc 上限超のため） / child: doc 削除 + `auth.deleteUser`。`clientData` / `operationLogs` の削除は呼出側（AdminApp orchestrator）の責務のまま |
| `listChildren` | filter | `tenants/{parentTid}/accounts` collection query |
| `detachChildBaseName` | map + 条件 saveClients | 該当 child doc に `updateDoc({ baseName: FieldValue.delete() })` を WriteBatch で。Firebase Auth Custom Claims の `baseName` 更新は Cloud Functions 経由 |

#### 13.4.1 transaction / Cloud Functions 候補

- **`delete` (parent)**: `tenants/{tid}` + 全 subcollection + 子 accounts + Firebase Auth ユーザー × N を横断削除。Cloud Functions で順次 + idempotent 再実行が必須
- **`detachChildBaseName`**: accounts doc 更新 + Custom Claims 更新の 2 系統。Cloud Functions に集約推奨（§12.4.1 の child baseName クリアと同一の責務、本 API に集約された）

### 13.5 移行履歴

- **M-1**（完了）: 型 + LocalStorage 実装の 5 API 追加（create / update / delete / listChildren / detachChildBaseName）。画面未連携
- **M-2**（完了）: AccountSettings の 4 callsite（saveCompanyInfo / addMember / deleteMember / toggleMemberNotify）を `findById + update` 経由に置換。password 変更は I-3 で既に authService 経由のため変更なし
- **M-3**（完了）: baseRepository.deleteWithCascade の child baseName クリアを `detachChildBaseName` 経由に置換。baseRepository から `storage.getClients/saveClients` 直叩きを完全消滅
- **M-4**（完了）: AdminApp.loadClients を `clientRepository.list()` 経由に置換。運営画面の初期読込から `storage.getClients` 直叩きを除去
- **M-5a**（完了）: AdminApp.handleToggleStatus / `onUpdateClient` prop 内部を `clientRepository.findById / update / list` 経由に置換。prop シグネチャ（呼出側 API）は維持
- **M-5b**（完了）: AdminApp.handleSave を `clientRepository.create / update` 経由に置換。親 companyName 変更時の child companyName 追従は `listChildren` + `update` ループで維持。password は `update` patch から strip されるため、handleSave 経路で password が変更されることはない（password 変更は M-7a の `authService.adminResetPassword` 専用経路のみ）
- **M-6**（完了）: AdminApp.handleDelete を `clientRepository.delete` 経由に置換。parent 削除時の child cascade は Repository 内に集約。`clientData (hireflow:client:{id}:data)` / `operationLogs (hireflow:client:{id}:logs)` の削除は AdminApp orchestration として呼出側に維持（責務分離は §13.3.4 の通り）
- **M-7a**（完了）: AuthService に `adminResetPassword(clientId, newPassword): Promise<AdminResetPasswordResult>` を追加 + LocalStorageAuthService に実装（弱パスワード検査 `length < 6`、id 不在で `not_found`、成功時に `clientRepository.saveAll` 経由で password 含む全件差し替え、sessionStorage は触らない）。AdminApp.handleUpdatePassword を `authService.adminResetPassword` 経由に置換し、旧 `saveAndReload` ヘルパは削除。ClientRepository は password を扱わない方針を維持
- **M-7b**（完了）: `src/utils/clientOptions.ts` の `incrementOptionUsage` を `clientRepository.findById / update` 経由に置換。`storage.getClients/saveClients` 直叩きを除去。dynamic import は AuthContext → clientOptions → repositories の起動順循環回避のため維持
- **M-8**（完了）: BaseManagement の削除確認ダイアログ用 child 件数取得を `clientRepository.listChildren(ownerId).filter(c => c.baseName === base.name).length` に置換。BaseManagement.tsx 内の `storage` import 完全消滅

### 13.6 残タスク

- **`saveAll` 撤去**: 現状の唯一の callsite は `LocalStorageAuthService.adminResetPassword` 内部（§13.3.6）。Firestore 化（Phase J-5）時に `adminResetPassword` 自体が Firebase Auth Admin SDK / Cloud Functions に置換されるタイミングで同時撤去候補
- **Firestore 実装本体**: §13.4 の表どおりの Firestore 版実装。Firebase Auth 連携 + Cloud Functions（parent delete cascade）が前提
- **`Client.findForLogin` 撤去**: Firebase Auth 移行と同時に削除候補（authService 内部のみが呼ぶ歴史的 API）
- **delete cascade の orchestrator 側（clientData / operationLogs キー削除）**: Firestore 化時は Cloud Functions の subcollection 再帰削除 or `tenants/{tid}` doc 削除トリガに移管。LocalStorage 期は AdminApp 内に残置（責務分離が明確なため Repository に巻き取らない）

---

## 14. 設定系 Repository 化（Phase N）

`AuthContext.updateClientData(updater)` を経由した「ClientData blob 一括 read / write」から、各設定ドメイン（Job / Source / EmailTemplate / 等）の Repository API へ責務境界を引き直すフェーズ。Phase J（Firestore 実装本体）の前段に位置付けられ、設定系 10 画面分の境界を確定させておく。

### 14.1 責務範囲

- 対象は `src/client/pages/settings/` 配下の 10 画面。`updateClientData(updater)` 経由の ClientData blob 更新を、ドメイン Repository API（create / update / delete / etc.）に置換する
- LocalStorage キーは変更しない（`hireflow:client:${id}:data`）
- ClientData の既存データ形状は維持する（型の正規化＝Job への baseName 追加 等は Firestore 化（Phase J）時に再設計）
- 子アカウント呼出時の applicants 絞り込み挙動（AuthContext.filterDataByBase 由来）は Repository 側の opt（例: `applicantBaseFilter`）で再現する
- 書込後の state 同期は `reloadClientData()` 経由に統一する（`updateClientData` の即時 setClientData 経路は撤去候補だが、Phase N の各画面が完了するまでは shim として残置）

### 14.2 進捗

- [x] **N-1**: `JobRepository` 型 + LocalStorage 実装 + JobManagement.tsx 移行
- [x] **N-2**: `SourceRepository` 型 + LocalStorage 実装 + SourceManagement.tsx 移行
- [x] **N-3**: `EmailTemplateRepository` 型 + LocalStorage 実装 + EmailTemplateManagement.tsx 移行（cascade なし、1000ms debounce auto-save は呼出側責務として既存挙動維持）
- [x] **N-4**: `HearingRepository` 型 + LocalStorage 実装 + HearingManagement.tsx 移行（base-override なし / jobName キー / cascade なし / 削除 API なし、800ms debounce auto-save + 手動保存ボタンは呼出側責務として既存挙動維持）
- [x] **N-5**: 既存 `reportRepository` 拡張（getReportSchedule / saveReportSchedule 追加） + ReportScheduleSettings.tsx 移行（singleton 設定型 / 保存ボタン式 / debounce なし、新規 Repository は作らず採用目標と同居）
- [x] **N-6**: `ExclusionRepository` 型 + LocalStorage 実装 + ExclusionList.tsx 移行（base-override なし / tenant 全体共有 / dedup 判定 Repository 内集約 / `applicantRepository.changeStageBulk` は画面側 orchestrator として維持）
- [x] **N-7**: `MediaCostRepository` 型 + LocalStorage 実装 + MediaCostManagement.tsx 移行（ネストマップ型 `[ym][src] -> number` / parseAmount + 月キー pruning + invalidCount 集計を Repository 内集約 / saveDraft は partial merge / removeSource は媒体名で全月横断 cascade）
- [x] **N-8**: `FilterConditionRepository` 型 + LocalStorage 実装 + FilterConditionSettings.tsx 移行（base 別 + legacy fallback を Repository 内集約 / legacy `filterCondition` は読み取り専用 / `updateForBase` のみ提供 / `applicantRepository.changeStageBulk` は画面側 orchestrator 維持）
- [ ] **N-9**: `ScreeningRepository`（byJob override + axes migration）
- [ ] **N-10**: `ChatbotRepository`（scenarios / questionGroups / leadSettings の 3 配列原子性）

### 14.3 N-1: JobRepository（base-override パターンの参照実装）

#### 責務

- `data.jobs` / `data.jobsByBase[baseName]` の CRUD と削除カスケード
- API: `list(clientId, baseName?)` / `create(clientId, job, baseName?)` / `update(clientId, jobId, patch, baseName?)` / `deleteWithCascade(clientId, jobId, opts?)` / `removeBaseOverride(clientId, baseName)`
- baseName 未指定: 全社共通レイヤ。指定: 拠点別レイヤ
- 拠点別レイヤ未作成での書込時は `data.jobs` をコピーして開始 → 拠点別レイヤを新規作成（既存 writeJobs と互換）

#### deleteWithCascade

- 対象レイヤから jobId 一致を除去 + `applicants[].job === removedJobName` を `''` にクリア + 1 saveClientData にまとめる
- `opts.applicantBaseFilter` で applicants クリア対象の base 絞り込み（子アカウント呼出時の自拠点 applicants 限定挙動を再現）
- `applicants[].updatedAt` は touch しない（既存 deleteJob 互換）

#### 移行先

- `src/client/pages/settings/JobManagement.tsx` の `writeJobs` / `deleteJob` / `removeOverride` を Repository 経由に置換
- 画面側は `updateClientData` を撤去し、`reloadClientData()` で state 同期する
- UI / 文言 / バリデーション / logAction は変更しない

#### Firestore 化（Phase J）時の差し替え候補

- `/tenants/{tid}/jobs/{jobId}` を 1 doc 単位とする collection 構造に分離
- 拠点別オーバーライドは案 A（doc に `baseName?: string | null` フィールド + 単一 collection）/ 案 B（`/tenants/{tid}/baseOverrides/{baseName}/jobs/{jobId}` 別 subcollection）から選択。クエリ性と Firestore Rules の書きやすさから案 A 寄り（決定は Phase J 時）
- `deleteWithCascade` は jobs collection の doc 削除 + applicants collection の対象 doc 更新を `runTransaction` / `WriteBatch` で 1 atomic 化

### 14.4 N-2: SourceRepository（base-override 型の横展開）

#### 責務

- `data.sources` / `data.sourcesByBase[baseName]` の CRUD と削除カスケード
- API は N-1 と完全同型: `list` / `create` / `update` / `deleteWithCascade(opts?: { baseName?, applicantBaseFilter? })` / `removeBaseOverride`
- 実装は `LocalStorageJobRepository` を機械的に横展開（`jobs` → `sources`, `jobsByBase` → `sourcesByBase`, `applicants[].job` → `applicants[].src`、結果型のフィールド名差し替え）

#### 既存挙動との差分

- 既存 `SourceManagement.deleteSource` は applicants[].src クリア時に **base 絞り込みをしていなかった**（全 applicants 横断）。Repository 化に際しては JobRepository に揃え `applicantBaseFilter` opt を提供し、呼出側 (SourceManagement.tsx) は child account のみ `client.baseName` を渡す
- 子アカ時は AuthContext.filterDataByBase が applicants を自拠点のみに絞っているため、既存挙動でも結果は「自拠点 applicants のみクリア」と等価。Repository 化後も振る舞いは保たれる
- inline editing (`saveEdit`) は full Source patch を渡すため、`update` の no-op 短絡（patch == current && overrideExists）に当たりやすい。データ的には等価（既存 writeSources はその場合も save していた = 余分書込が消える方向の差分のみ）

#### 移行先

- `src/client/pages/settings/SourceManagement.tsx` の `writeSources` ヘルパは削除、`addSource` / `saveEdit` / `deleteSource` / `removeOverride` を Repository 経由に置換
- 画面側は `updateClientData` を撤去し、`reloadClientData()` で state 同期する
- UI / 文言 / バリデーション / logAction / showPw（パスワード表示トグル）は変更しない
- `Source.password` は本フェーズでは平文のまま流通させる（既存仕様維持）

### 14.5 N-3: EmailTemplateRepository（cascade なし base-override 型）

#### 責務

- `data.emailTemplates` / `data.emailTemplatesByBase[baseName]` の CRUD
- API: `list` / `create` / `update` / `delete(clientId, templateId, baseName?)` / `removeBaseOverride`
- 実装は `LocalStorageSourceRepository` をベースに **cascade ロジックと `applicantBaseFilter` opt を削除**
- baseName 未指定: 全社共通レイヤ / 指定: 拠点別レイヤ。未作成時は `data.emailTemplates` をコピーして開始（既存 writeTemplates 互換）

#### N-1/N-2 との差分

- **削除カスケードなし**: applicants 側にテンプレート参照フィールドが存在しないため、`delete` API は applicants を一切触らない（既存 deleteTemplate 互換）。`deleteWithCascade` / `applicantBaseFilter` opt は不要
- **呼出側に 1000ms debounce auto-save あり**: `EmailTemplateManagement.tsx` の `name` / `subject` / `body` 入力は `scheduleAutoSave` → `setTimeout(..., 1000)` 経由で `doSave()` を呼び、`doSave()` が `emailTemplateRepository.update(...)` + `reloadClientData()` を実行する。Repository は同期 API のまま（既存挙動維持）
- **切替時 flush**: テンプレ選択切替時に既存タイマーがあれば `clearTimeout` + 即時 `doSave()`。Repository が同期実行のため flush 後の `setSelectedId(t.id)` → useEffect [selectedId] チェーンは既存と等価

#### 既知の挙動メモ（既存 + N-3 共通、本フェーズで触らない）

- **単一キーストロークの closure off-by-one**: `onChange` で `setBody(newVal)` + `scheduleAutoSave()` を同期実行するが、`scheduleAutoSave` が捉える `doSave` は **その直前のレンダーの closure**（body はまだ古い値）。連続入力では「直前の値が 1000ms 後に保存される」挙動になる（最後のキーストロークは次回入力 or 切替時 flush で確定）。**Repository 化前と完全に同じ挙動**で、N-3 では修正しない
- **アンマウント時 flush 未実装**: 1000ms 以内に他画面遷移すると未保存。既存挙動維持

#### 移行先

- `src/client/pages/settings/EmailTemplateManagement.tsx` の `writeTemplates` ヘルパは削除、`addTemplate` / `doSave` / `deleteTemplate` / `removeOverride` を Repository 経由に置換
- 画面側は `updateClientData` を撤去し、`reloadClientData()` で state 同期する
- UI / 文言 / バリデーション / VARIABLES / 1000ms debounce / 切替時 flush / saveState 表示は変更しない

#### Firestore 化（Phase J）時の差し替え候補

- `/tenants/{tid}/emailTemplates/{templateId}` 単一 collection + `baseName?: string | null` フィールド（案 A）/ 別 subcollection（案 B）
- `body` が長文化しやすいため、quota / 転送量観点で案 A 寄り（必要なテンプレートだけ取得できる）
- `update` は `Promise<EmailTemplate>` 化し、画面側は async/await + saveState を Promise 完了まで延長。アンマウント時 flush の改善とセットで検討

### 14.6 N-4: HearingRepository（base-override なし / jobName キー / 最小 CRUD）

#### 責務

- `data.hearingTemplates` の list と jobName キー upsert
- API: `list(clientId)` / `upsert(clientId, jobName, templateBody)` の **2 個のみ**
- 完全一致時は no-op で current を返す（saveClientData を呼ばない）

#### N-1/N-2/N-3 との差分

- **base-override なし**: `AuthContext.filterDataByBase` は hearingTemplates を触らず、子アカも全社共通を参照する。`data.hearingTemplatesByBase` は存在しない / 追加もしない → `pickLayer`/`writeLayer`/`removeBaseOverride` を持たない
- **削除 API なし**: HearingManagement に削除 UI がない / Job 削除カスケード連携も別フェーズ → `delete` / `removeByJob` を提供しない（interface にはコメントで将来予約のみ記載）
- **削除カスケードなし**: applicants にヒアリング参照フィールドが存在しない → `applicantBaseFilter` opt も不要
- **キーが numeric id ではなく jobName 文字列**: 単一エントリポイント `upsert` で create/update を統合（add UI が存在せず、初回保存 = 暗黙 add であるため自然）
- **呼出側に 800ms debounce auto-save + 手動保存ボタンあり**: `HearingManagement.tsx` の `handleChange` は `setTimeout(..., 800)` 経由で `doSave(value)` を呼び、`handleManualSave` は `clearTimeout` + 即時 `doSave(template)`。`doSave` は `hearingRepository.upsert(...)` + `reloadClientData()` を実行。Repository は同期 API のまま（既存挙動維持）
- **`doSave` の closure off-by-one なし**: 引数 `value` で受け取る設計のため EmailTemplate のような off-by-one は存在しない（健全）

#### 既知の挙動メモ（既存仕様、本フェーズで触らない）

- **Job 切替時の未 flush**: 切替 useEffect は `clearTimeout` を呼ばずに `setTemplate(found?.template)` で上書きする。800ms 内編集が切替で失われる可能性（pre-existing）。N-4 では維持。改善する場合は別フェーズで EmailTemplate と同じ「切替時 flush」を導入
- **Job rename / delete の orphan**: `jobRepository.deleteWithCascade` は hearingTemplates をクリアしない → 削除済 Job 名で hearingTemplates が残る可能性（pre-existing）。N-4 では維持。連携カスケードは別フェーズ
- **AdminApp bulk-copy の localStorage 直書き共存**: `AdminApp.tsx:4196` は `localStorage.setItem(...)` で hearingTemplates をコピーしており、Repository 経由ではない。N-4 では触らない（Job/Source/EmailTemplate も同じ共存状態）
- **アンマウント時 flush 未実装**: 800ms 以内に他画面遷移すると未保存。既存挙動維持

#### 移行先

- `src/client/pages/settings/HearingManagement.tsx` の `updateClientData` 呼出を `hearingRepository.upsert(...)` + `reloadClientData()` に置換
- `useAuth` 分割代入は `updateClientData` → `reloadClientData` に差し替え
- `ownerId = resolveDataOwnerId(client)` を doSave 内で参照（書込は parent clientId に統一、既存責務境界と同じ）
- UI / 文言 / 800ms debounce / 手動保存ボタン / saveState 表示 / Job 切替 useEffect は変更しない

#### Firestore 化（Phase J）時の差し替え候補

- `/tenants/{tid}/hearingTemplates/{docId}` 単一 collection（base-override なし）
- docId 候補: sanitized jobName（衝突リスクあり）/ random id + jobName field（Job rename 時に jobName field 更新が必要、または jobId 外部キー化）→ 設計判断は Phase J 時
- `upsert` は `Promise<HearingTemplate>` 化し、画面側は async/await + saveState を Promise 完了まで延長。Job rename / delete カスケード連携もこのタイミングで検討（jobs collection の rename listener / cloud function での bulk update）

### 14.7 N-5: ReportSchedule（reportRepository 拡張 / singleton 設定型 / 保存ボタン式）

#### 責務

- `data.reportSchedule` の get / save（singleton な ReportScheduleSetting オブジェクト）
- API: `getReportSchedule(clientId)` / `saveReportSchedule(clientId, setting)` を **既存 reportRepository に追加**（新規 Repository は作らない）
- `saveReportSchedule` は全置換（partial update なし、no-op 短絡なし、saveClientData 1 回）

#### 別 Repository を新設せず reportRepository 拡張にした理由

- ドメインが近い（どちらも採用レポート関連設定 / 利用画面は別だが論理ドメインは同じ）
- 既存 `LocalStorageReportRepository` が 2 メソッドのみと薄く、singleton 設定追加で適度な責務範囲に成長する
- Firestore マッピング（`/tenants/{tid}/settings/global` doc 内に `recruitmentGoals` と `reportSchedule` を同居させる設計、firestore-design.md §6.2/§6.4）と整合
- handoff checklist L128 / firestore-design.md L379 で「reportRepository 拡張でも可」と既に明記済

#### N-1〜N-4 との差分

- **singleton 設定型**: id なし / jobName なし / base-override なし / 配列ですらない（オブジェクト 1 個）。`upsert` 等のキー操作 API は不要、`save` で全置換するだけ
- **保存ボタン式（debounce なし）**: フィールド変更は local state (`setting`) のみ更新、「保存」ボタンクリック時に 1 回だけ Repository を呼ぶ。EmailTemplate (1000ms) / Hearing (800ms) のような auto-save タイミング維持の考慮は不要
- **新規 Repository を作らない**: 既存 reportRepository を拡張する初の N-5 ケース（singleton + 既存薄 Repository への追加というパターン）
- **lastRunAt / lastRunStatus / lastRunError の扱い**: ReportScheduleSetting に含まれるが、現状クライアント側で書込する経路はない（将来サーバー側配信エンジンが書き込む想定）。読取りは `getReportSchedule` で setting 全体に同居する形で取得され、`saveReportSchedule` は呼出側の state.setting にこれらが含まれていれば保持する。**N-5 では lastRun* 専用 API は作らない**

#### 既知の挙動メモ（既存仕様、本フェーズで触らない）

- **権限ガードなし**: ReportScheduleSettings.tsx は `canEdit` / `permissions.*` チェックを持たない。ルーティング側の `reportEnabled = hasActiveOption(client, 'recruitmentReport')` でアクセスを絞っているのみ。N-5 でも追加しない
- **logAction なし**: 設定保存時の operationLogs 追記なし。N-5 でも追加しない
- **DEFAULT_SETTING フォールバックは呼出側責務**: `useEffect` で `clientData.reportSchedule` が unset の場合に state はそのまま `DEFAULT_SETTING` のまま。save すると DEFAULT_SETTING が永続化される（既存挙動）。Repository 側はフォールバックしない
- **lastRun* と recipients の同時編集の race（将来）**: サーバー配信エンジン稼働後は Cloud Functions が `lastRunAt` を書込中にユーザーが「保存」を押すと、saveReportSchedule の全置換で `lastRunAt` が古い値で上書きされる可能性。N-5 では未対応（Phase J で `merge: true` / 部分更新 API / トランザクションで対処）

#### 移行先

- `src/client/pages/settings/ReportScheduleSettings.tsx` の `save()` 関数を Repository 経由に置換（1 関数のみ変更）
- `useAuth` 分割代入は `updateClientData` → `reloadClientData` + `client` に差し替え
- `ownerId = resolveDataOwnerId(client)` を save() 内で参照（書込は parent clientId に統一、既存責務境界と同じ）
- UI / 文言 / DEFAULT_SETTING / 保存ボタン / saved 表示 / email validation (regex) / next 配信予定計算 (`nextScheduledRun`) は変更しない

#### Firestore 化（Phase J）時の差し替え候補

- 案 A: `/tenants/{tid}/settings/global` doc 内 `reportSchedule` フィールド（recruitmentGoals / filterCondition / screeningCriteria / mediaCosts と同居）
- 案 B: `/tenants/{tid}/reportSchedule` 専用 doc（lastRun* を Cloud Functions が頻繁に書込するなら分離が合理的）
- `saveReportSchedule` は `Promise<void>` 化、画面側は async/await。`merge: true` で部分更新化し lastRun* の race を回避
- 配信エンジン用 API（markRunSuccess / markRunFailure）は Cloud Functions 専用書込権限 + Security Rules で `recipients` / `enabled` 等の編集権限と分離する設計余地あり

### 14.8 N-6: ExclusionRepository（base-override なし / dedup Repository 集約 / changeStageBulk は画面側）

#### 責務

- `data.exclusionList` の list / add / remove
- API: `list(clientId)` / `add(clientId, entry)` / `remove(clientId, id)` の **3 個のみ**
- dedup 判定（email lowercase / phone strip `-\s` / name_birth exact）を Repository 内に集約

#### N-1〜N-5 との差分

- **add が dedup 失敗で `{ok:false, reason:'duplicate'}` を返す result 型 API**: 初の N-6 ケース。create / upsert 系と異なり、保存試行が成功 / duplicate の 2 値で分岐し、duplicate 時は saveClientData を呼ばない
- **base-override なし**: tenant 全体で 1 リスト共有（子アカも親と同じ exclusionList を参照）→ `pickLayer`/`writeLayer`/`removeBaseOverride` を持たない / `applicantBaseFilter` opt も不要
- **削除カスケードなし**: 除外解除で過去 applicant を active に戻したりしない既存仕様。`remove` は exclusionList から id 一致を除去するのみで applicants 側を触らない
- **changeStageBulk は本 Repository に取り込まない**: add 成功後の「該当 applicant の一括除外」は画面側 orchestrator で `applicantRepository.changeStageBulk(..., { reason: 'exclusion_list_applied' })` を続けて呼ぶ責務。Firestore 化時に 1 transaction 化を別 API として検討予定（firestore-design §4.1）
- **applicantRepository.delete の cleanup は据え置き**: applicantRepository.delete 内の `(ex as { applicantId?: number }).applicantId === applicantId` 一致 cascade は既存 Repository に閉じ込め継続。本 Repository には `cleanupByApplicantId` 等を作らない（依存方向逆流を避ける）

#### ExclusionEntry 型の `applicantId?` について

- 型未宣言の旧データ互換隠しフィールド。`applicantRepository.delete` のみが `(ex as { applicantId?: number }).applicantId` で参照する
- 現在 UI 経路でこれを生成するパスはない（`ExclusionList.addEntry` は `{type, email/phone/name+birth}` のみを Repository に渡す）
- firestore-design.md §8.1 / §10.6.3 に `applicantId?` がドキュメント化済（FK として string 化する移行方針）
- **Phase N-6 では ExclusionEntry 型に追加しない**: 「特定 applicant を直接 exclusion 登録する UI」が前提となる API 変更で、本フェーズの責務を越える。旧データ互換のまま維持

#### 既知の挙動メモ（既存仕様、本フェーズで触らない）

- **権限ゲート**: `client.permissions.exclusion` または parent のみ canEdit。Repository 化後も UI 側で維持
- **dedup の正規化ルール**: Phase N-6 で Repository 内に集約。将来ルール変更時は `exclusionRepository.ts` の `isDuplicate` 1 箇所だけ更新すれば足りる（以前は UI 側にも同ロジックがあった）
- **id 採番**: `max(...exclusionList.map(e => e.id)) + 1`。空配列時は reduce 初期値 0 → 新規 id=1（既存 ExclusionList.addEntry と完全一致）
- **入力 trim / 必須項目チェック**: 呼出側責務（既存 UI が trim 済の値を Repository に渡す前提）。Repository 側で再 trim / 必須チェックは行わない
- **AddApplicantModal の dedup 警告**: 応募者追加時に `data.exclusionList` を読んで alert を出す経路（read 専用）。N-6 では触らない
- **AddApplicantModal の duplicate back-prop**: 既存仕様。N-6 範囲外

#### 移行先

- `src/client/pages/settings/ExclusionList.tsx` の `addEntry` / `deleteEntry` を Repository 経由に置換
- `useAuth` 分割代入から `updateClientData` を削除（`reloadClientData` / `client` / `clientData` のみ利用）
- `addEntry` の dedup 判定ロジックは削除（Repository に集約）。UI は `{ok:false, reason:'duplicate'}` を受け取った時に既存と同じメッセージを表示するのみ
- add 成功後の `applicantRepository.changeStageBulk` 呼出は既存通り画面側で維持
- UI / 文言 / バリデーション / 権限ガード / pagination / search / typeFilter / Modal は変更しない

#### Firestore 化（Phase J）時の差し替え候補

- `/tenants/{tid}/exclusionList/{eid}` 1 entry = 1 doc 展開（firestore-design §8.1）
- Security Rules: parent のみ write（firestore-design §8.2）
- `add` + `changeStageBulk` を `runTransaction` で 1 atomic 化する API を別途検討（`addAndExclude` のような composite API。LocalStorage 実装では各 Repository を逐次呼ぶ thin wrapper、Firestore 実装では transaction を張る）
- id は autoId (string) 化、`applicantId?` は string FK に変換
- `applicantRepository.delete` の exclusionList cleanup は Firestore でも transaction 内で 3 collection 削除に置換（firestore-design §4）

### 14.9 N-7: MediaCostRepository（ネストマップ型 / draft 一括反映 / parseAmount + pruning 集約）

#### 責務

- `data.mediaCosts` (`[ym][src] -> number` のネストマップ) の getAll / saveDraft / removeSource
- API: `getAll(clientId)` / `saveDraft(clientId, draft)` / `removeSource(clientId, sourceName)` の **3 個のみ**
- parseAmount（全角→半角 / カンマ・空白除去 / 1〜100,000,000 / 範囲外は null）/ 月キー pruning / invalidCount 集計を Repository 内に集約

#### N-1〜N-6 との差分

- **ネストマップ型** (`{[ym]: {[src]: number}}`): 初の N-7 ケース。Job / Source / EmailTemplate / Hearing / Exclusion は配列、ReportSchedule は singleton。MediaCost のみ 2 階層 map
- **draft 一括反映 API** (`saveDraft`): `setEntry` のような cell 単位 API ではなく、UI の draft state を 1 回で flush する。Firestore 化時に WriteBatch を組み直さなくて済む / アトミック性が自然に確保される
- **削除カスケード方向が逆** (`removeSource`): 媒体名で全月横断 cascade 削除（applicants 側ではなく mediaCosts 内部の cascade）
- **invalidCount 返却**: parse 失敗 cell の存在を呼出側 UI に通知する初のケース。UI 側は `> 0` の場合に既存 alert 文言を表示する責務
- **2 階層 deep copy 必須** (`getAll`): 既存 `storage.getClientData` は shallow copy のみ。呼出側 mutate が localStorage に漏れないよう、Repository 内で第 1 階層 reduce + 第 2 階層 `{...inner}` で複製
- **base-override なし**: tenant 全体で 1 リスト共有（子アカも親と同じ mediaCosts を参照、N-4 Hearing / N-5 ReportSchedule / N-6 Exclusion と同じスタンス）

#### 既存挙動 → Repository 内仕様（厳密維持ポイント）

- **空文字 vs 未入力の区別**: draft の値が `''` (trim 後) → 該当 entry を delete。draft に key 自体がない → 触らない（partial merge）
- **invalid 時の cell 削除**: parseAmount が null → 該当 entry を delete + invalidCount++（既存挙動と一致）
- **既存値同値の no-op**: `before === num` の場合は `appliedCells` に含めず touch しない（既存挙動より少し最適化。データ的には等価で無駄な書込が消える方向の差分のみ）
- **月キー pruning**: 月内 entry が 0 件になった時にその月キーごと `delete` する。`save()` / `removeSource()` 双方で必須（Firestore 化時に空 doc が残るリスク、`clientStats.ts:84` の monthsWithCost のカウントを壊さないため）
- **全 cell no-op の場合は saveClientData を呼ばない**（`changed: false`）: 無駄 save 回避
- **`removeSource` 該当なし時も saveClientData を呼ばない**（`affectedMonths: 0`）: 無駄 save 回避
- **parseAmount のルール**: 1 億円上限 / `MIN_AMOUNT = 1` / `MAX_AMOUNT = 100_000_000` を Repository 内定数として宣言（将来ポリシー変更時の単一更新点）

#### 既知の挙動メモ（既存仕様、本フェーズで触らない）

- **Source rename / delete と mediaCosts の orphan**: `sourceRepository.deleteWithCascade` (N-2) は applicants[].src だけクリアし mediaCosts は touch しない → 削除済 Source 名で mediaCosts にエントリが残る可能性（pre-existing）。N-7 では維持。連携カスケードは別フェーズ
- **extraSources の永続化欠落**: UI ローカル state のみ。媒体追加→値未入力で保存しない場合に名前が消える既存仕様。N-7 では維持
- **権限ガードなし**: MediaCostManagement.tsx は `canEdit` / `permissions.*` チェックを持たない（ReportScheduleSettings と同じ）。`if (!client)` で読み込み中表示するのみ。N-7 でも追加しない
- **logAction なし**: 保存時の operationLogs 追記なし。N-7 でも追加しない
- **inline preview の簡易 parse**: `getValue` / `sourceTotal` / `monthTotal` の inline parse はカンマ除去のみの簡易版で、Repository の厳密 parseAmount とは別物。プレビューの即時表示性と保存時の厳密性を分離する設計として維持
- **2 タブ同時編集の race**: 2 タブで同じ tenant の異なる cell を編集すると、後勝ちで上書きされる可能性（pre-existing）。Phase J で `merge: true` / 楽観ロック等で対処
- **read 経路の Repository 化なし**: `aggregate.ts` (`calcCostBreakdown` / `sumMediaCostsInRange`) は `data.mediaCosts` を直接受け取る純粋関数として残置。`AdminApp.tsx` / `clientStats.ts` の集計も同様。本フェーズでは write 経路のみを Repository 化

#### 移行先

- `src/client/pages/settings/MediaCostManagement.tsx` の `save()` / `removeSource()` 2 関数を Repository 経由に置換
- `useAuth` 分割代入は `updateClientData` → `reloadClientData` に差し替え
- `ownerId = resolveDataOwnerId(client)` を save / removeSource 内で参照（書込は parent clientId に統一、既存責務境界と同じ）
- UI の `parseAmount` ヘルパは削除（Repository に集約）。inline preview の簡易 parse は維持
- UI / 文言 / バリデーション / confirm dialog / extraSources / 月切替 / 表示用 inline parse は変更しない

#### Firestore 化（Phase J）時の差し替え候補

- 案 A: `/tenants/{tid}/settings/global` doc の `mediaCosts` map field（recruitmentGoals / reportSchedule と同居、firestore-design §6.2）
- 案 B: `/tenants/{tid}/mediaCosts/{ym}` 月別 doc（24 ヶ月 × 多媒体で 1 MB に近づく場合）
- `saveDraft` は WriteBatch で 1 transaction 化、`removeSource` は影響月の doc 更新を WriteBatch で 1 atomic 化
- 部分更新は `merge: true` で各月 doc を更新（lastRunAt の race 問題と類似）
- Source rename / delete と mediaCosts の連動も Cloud Functions（または `sourceRepository.deleteWithCascade` の拡張）で transaction 内に追加検討

### 14.10 N-8: FilterConditionRepository（legacy + base override の 2 系統 / legacy 不変）

#### 責務

- `data.filterCondition` (legacy 全社共通) の **読み取り fallback 専用**
- `data.filterConditions[baseName]` (base 別) の `updateForBase` による partial merge
- `getLegacy` / `getByBaseMap` / `getEffective` / `updateForBase` の 4 API

#### N-1〜N-7 との差分

- **legacy + base override の 2 系統だが構造は単純**: Job / Source / EmailTemplate のような「base 別配列 + 全社配列」ではなく、**「単一オブジェクト + base 別オブジェクト」** の組合せ
- **legacy 不変を強制**: 他の base-override パターン (N-1〜N-3) は legacy を `update` / `add` で更新する API を持つが、FilterConditionRepository は **legacy 書換 API を提供しない**（AdminApp の設定コピー経路が別経路として存在するため、Repository 経由を強制すると壊れる）
- **partial merge の base 解決を Repository に集約**: `current = filterConditions[baseName] || legacy || defaultFC` の解決ロジックを Repository に移動（既存 FilterConditionSettings.updateFC L107-116 と完全一致）
- **defaultFC は画面側と同等**: `ageEnabled:false / 18-65 / 空配列 / excludeStatus:''` 。`storage.ts` の新規 client 初期化値（`ageEnabled:true / 18-55 / excludeStatus:'対象外' / flagAges:[18,19,50,55]`) とは**意図的に異なる**（legacy も base 別も無いときの最終 fallback 用途）

#### updateForBase の挙動

- baseName が空文字なら `{ok:false, reason:'no_base_selected'}` を返し saveClientData を呼ばない
- 初回 update（base override 未存在から作成）の場合 `promotedToBaseOverride: true`、2 回目以降は `false`
- legacy `filterCondition` は **絶対に touch しない**
- next FilterCondition は呼出側に shallow copy で返す（呼出側 mutate が localStorage に漏れない）

#### 移行先

- `src/client/pages/settings/FilterConditionSettings.tsx`
  - `useAuth` から `updateClientData` 除去（`reloadClientData` に統一）
  - `fc` 取得を `filterConditionRepository.getEffective(ownerId, selectedBase)` に集約（useMemo + `client / selectedBase / filterConditions / filterCondition` 依存）
  - `updateFC` を `filterConditionRepository.updateForBase(ownerId, selectedBase, partial)` に置換 → `reloadClientData()`
  - **一括除外実行 (`executeExclusion`) は既存通り画面側で `applicantRepository.changeStageBulk(..., reason:'filter_condition_applied')` を呼ぶ**（Repository に取り込まない）
  - UI / 文言 / `canEdit` / `bases.length === 0` 早期 return / `affected` プレビュー / Modal 文言は変更しない

#### 既存挙動の厳密維持

- 「拠点別未設定」表示 (`(デフォルト設定を継承中 — 保存すると拠点専用になります)`) は `filterConditions[selectedBase]` の存在チェックを継続。`promotedToBaseOverride` は将来 UX 強化用に予約
- `flagAges` の base 別 fallback（`ApplicantList.flagAgesByBase`）は **N-8 スコープ外**として現状維持（clientData 直参照のまま）
- `AddApplicantModal.checkExclusion` の legacy 直接参照（base 別を見ない既存バグ的挙動）も N-8 スコープ外
- `AdminApp` の設定コピー機能（`dstData.filterCondition = ...`）も N-8 スコープ外
- `applicantRepository.changeStageBulk` の reason 文字列 `'filter_condition_applied'` は変更しない（stageHistory の既存レコードとの整合）
- `baseRepository.deleteBase` 内の `filterConditions[baseName]` 削除（baseRepository.ts L148-151）は既存集約済み、N-8 で重複呼出はしない

#### Firestore 化（Phase J）時の差し替え候補

- legacy: `/tenants/{tid}/settings/global` doc の `filterCondition` field（screeningCriteria / recruitmentGoals / mediaCosts / reportSchedule と同居、firestore-design §6.2）
- base 別: `/tenants/{tid}/baseOverrides/{baseName}` doc の `filterCondition` field（jobs / sources / emailTemplates と同居、firestore-design §6.3）
- `updateForBase` は `/tenants/{tid}/baseOverrides/{baseName}` を `merge: true` で部分更新
- `getEffective` は 2 doc fetch（baseOverrides → settings/global の順、片方欠落時に他方で fallback）

### 14.11 残タスク

- **N-9 以降**: §14.2 の通り、設定系 2 種が残着手対象。N-9 = Screening（byJob override + axes migration） / N-10 = Chatbot（scenarios / questionGroups / leadSettings の 3 配列原子性）
- **`updateClientData` shim の撤去**: Phase N 全 10 画面の Repository 化が完了したタイミングで `AuthContext.updateClientData` 自体を撤去候補とする
- **正規化（Job / Source / EmailTemplate / Hearing 等への baseName / id フィールド追加）**: Phase J（Firestore 化）時の設計判断で再検討
- **共通 base-override ヘルパ**: N-1 (Job) / N-2 (Source) / N-3 (EmailTemplate) で同じ `pickLayer` / `writeLayer` パターンが 3 個。N-8 (FilterCondition) は「単一オブジェクト + base 別オブジェクト」型で構造が異なるため別系統。N-9 Screening の `byJob override` を待って共通化を再検討（型パラメータ + cascade callback で抽象化可能。早すぎる抽象化は避ける）
- **AddApplicantModal / ApplicantList / AdminApp の filterCondition 直参照**: N-8 スコープ外として現状維持。`AddApplicantModal.checkExclusion` は legacy のみ参照（base 別を見ない既存バグ的挙動）、`ApplicantList.flagAgesByBase` は clientData 直参照、`AdminApp` 設定コピーは `dstData.filterCondition` 直書き。Repository 経由化は別フェーズ（後続のリファクタ判断で実施）
- **FilterConditionRepository の base override 削除 API**: 現状「拠点専用 → legacy 継承戻し」UX が UI に存在しないため未実装。要件として上がった時点で `removeBaseOverride(clientId, baseName)` を新設（baseRepository.deleteBase 内の `filterConditions[baseName]` 削除とは別経路）
- **FilterConditionRepository の updateLegacy API**: AdminApp 設定コピー経路を Repository 経由化する時に追加検討。現状は legacy 不変ポリシー（書換 API なし）で防衛
- **ExclusionRepository の `addAndExclude` composite API**: 現状 ExclusionList.tsx で `exclusionRepository.add` → `applicantRepository.changeStageBulk` の 2 段呼びを維持。Firestore 化（Phase J）時に 1 transaction 化が必要なら composite API を新設（firestore-design §4.1 既知の検討事項）
- **ExclusionEntry 型への `applicantId?` 追加**: 「特定 applicant を直接 exclusion 登録する UI」を実装する時に併せて型追加。現状は旧データ互換隠しフィールドのまま維持
- **Source rename / delete と mediaCosts の orphan**: pre-existing（`sourceRepository.deleteWithCascade` は mediaCosts を touch しない）。N-7 では据え置き。連携を入れる場合は SourceRepository.deleteWithCascade の拡張 + `mediaCostRepository.removeSource` 呼出 or Cloud Functions（Firestore 化時）
- **MediaCostManagement の extraSources 永続化 / 1 億円上限のポリシー化**: 既存挙動維持。改善する場合は別フェーズ（UI 改善 + 設定 UI でポリシー化）
- **`Source.password` の暗号化 / 秘匿化**: 既存仕様維持で本フェーズ対象外。Firestore 化（Phase J）と合わせて検討（client-side encryption / Cloud KMS / 別 collection 分離など）
- **EmailTemplateManagement の closure off-by-one / アンマウント時 flush**: 既存挙動。改善する場合は別フェーズ（useRef で最新値を参照する pattern / useEffect cleanup で flush 等）
- **HearingManagement の Job 切替時 flush / Job rename・delete カスケード**: 既存挙動。改善する場合は別フェーズ（切替 useEffect で `clearTimeout` + 即時 doSave / jobRepository.deleteWithCascade 連携）
- **ReportScheduleSettings の lastRun* 専用書込 API**: サーバー配信エンジン稼働時に追加（markRunSuccess / markRunFailure）。Firestore 化（Phase J）と合わせて Cloud Functions 書込権限分離も検討
