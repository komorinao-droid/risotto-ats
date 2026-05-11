# 本番実装前 未確定要件メモ (Open Decisions)

> **対象**: プロダクトオーナー / プロジェクト責任者
> **目的**: 本番 Firestore / Firebase Auth / Cloud Storage 実装に着手する前に、**意思決定**が必要な項目を 1 ファイルに集約する。技術選定そのものではなく、ビジネス側 / 運用側で決めなければ実装担当がブロックされる項目を扱う。
> **本書の役割**: `docs/production-handoff-checklist.md` の §10.6 で列挙した未確定項目に **推奨案 / 代替案 / 未決時のリスク / 決定期限** を加えて意思決定を促進する。
>
> **本書のスコープ外**: 実装、UI 変更、SMS / メール送信ロジック、コスト試算の詳細

各項目の凡例:
- **推奨案**: Claude 側がコードベースの状態と一般的な SaaS 運用から見て妥当と考える案
- **代替案**: 同等に取りうる選択肢
- **未決リスク**: 決定が無いまま実装が走った場合の影響
- **決定期限**: どの Phase J までに合意が必要か (詳細は `docs/production-handoff-checklist.md §4`)
- **影響範囲**: どの実装担当 / どのファイル群が影響を受けるか

---

## 0. 意思決定サマリ表

| # | 項目 | 推奨案 | 期限 |
|---|---|---|---|
| 1 | Firebase Project 環境分離 | dev / staging / prod 3 分離 | Phase J-1 着手前 |
| 2 | 認証方式 | Email/Password (Phase 1) → Google Identity 追加 (Phase 2) | Phase J-3 着手前 |
| 3 | tenantId の扱い | 既存 `client.id` を維持 | Phase J-2 着手前 |
| 4 | ID 型移行 | string 化 PR を Firestore 実装前に分離投入 | Phase J-2 着手前 |
| 5 | PII 保持期限 | applicant 3 年 / files 3 年 / messageLogs 1 年 / operationLogs 1 年 | Phase J-6 (Cloud Functions) 着手前 |
| 6 | ファイルサイズ / mimeType | 10 MB 上限 / pdf,jpg,png,xlsx,docx,csv | Phase J-7 着手前 |
| 7 | SMS / メール送信境界 | ATS は draft 作成 + 結果反映、送信は別サービス | Phase J-2 (MessageRepository Firestore 化) 着手前 |
| 8 | Backup / rollback | PITR + 日次 scheduled export to GCS + dual-write hybrid 1〜2 週間 | Phase J-8 着手前 |
| 9 | Security Rules 運用 | 多重防御 (UI + Rules) / child は自拠点のみ / admin claim は Cloud Functions 専用 | Phase J-1 着手前 |
| 10 | 監査ログ hash chain | Cloud Functions で append-only + chain 計算 | Phase J-6 着手前 |
| 11 | コスト上限 / レート制限 | Anthropic 月額上限 + Firestore 想定 QPS 設定 + Storage 容量アラート | Phase J-6 着手前 |
| 12 | E2E / staging gate | `handoff §9.1〜§9.5.1` を必須通過。staging で 1 週間 dual-write 後に prod 切替 | Phase J-9 着手前 |

---

## 1. Firebase Project の環境分離

### 1.1 決定事項

dev / staging / prod の Firebase project をいくつ分けるか。

### 1.2 推奨案: 3 分離 (dev / staging / prod)

| 環境 | 用途 |
|---|---|
| dev | 開発者ローカル。Emulator Suite + 軽量 Firestore project (任意) |
| staging | 本番前検証。本番と同じ Rules / index / Functions を反映。Migration ツールの試走 |
| prod | 本番 |

### 1.3 代替案

- **2 分離 (dev/prod のみ)**: コスト最小だが、Rules / index 変更を本番でしか試せない (リスク高)
- **1 つ + Emulator のみ**: 個人開発レベルでは可。商用 SaaS では NG

### 1.4 未決リスク

- staging が無いと、Rules 変更や Migration ツールの試走が本番でぶっつけになる
- Firestore index の作成は数分〜数時間かかる (件数次第)。本番で `INDEX needed` エラーが出ると、復旧待ち時間が SLA に直撃

### 1.5 決定期限

**Phase J-1 着手前** (Firebase 基盤セットアップの直前)

### 1.6 影響範囲

- インフラ担当: project 3 つの billing / IAM 設定
- CI/CD 担当: GitHub Actions の Firebase deploy target を 3 環境分用意
- 開発者: `.env.development / .env.staging / .env.production` の振り分け

---

## 2. Firebase Auth の認証方式

### 2.1 決定事項

ユーザーがどの方法でログインするか。MFA を必須化するか。

### 2.2 推奨案: 段階導入

| Phase | 方式 |
|---|---|
| Phase J-3 (本番認証切替) | **Email/Password のみ** (現状の LocalStorage 認証と等価) |
| Phase J-3 + α | パスワードリセットメール (`sendPasswordResetEmail`) を必須機能として有効化 |
| 後続 (Phase K?) | Google Identity (Workspace 連携を希望する企業向け) を追加 |
| 後続 | 運営アカウントのみ MFA (TOTP) 必須化 |
| 後続 | クライアント側 (parent) アカウントの MFA 任意化 |

### 2.3 代替案

- **A. Phase J-3 から Google Identity 必須**: 個人 Gmail との衝突 / 企業ドメイン縛りの設計が必要 → 移行コスト増
- **B. Phase J-3 から MFA 必須**: ユーザー教育コストが高い。LocalStorage からの移行と同時にやると失敗率が上がる
- **C. SSO (SAML / OIDC) 対応**: 大手企業向けに必要だが、Firebase Auth は SAML を Identity Platform (有償) で提供。要否を確認

### 2.4 未決リスク

- 認証方式が決まらないと `FirebaseAuthService` の実装が書けない (`signInWithEmailAndPassword` か `signInWithPopup(google)` か等)
- パスワードリセットの UX (メール送信 / 再設定画面) は実装範囲が大きいため、要否を早期決定すべき
- MFA を後付けすると全ユーザー再登録が必要になる場合あり

### 2.5 決定期限

**Phase J-3 着手前** (FirebaseAuthService 実装の直前)。最低限「Phase J-3 では Email/Password のみで進める」を確定させれば実装は走れる。

### 2.6 影響範囲

- `src/services/auth/firebase/` 実装担当
- AdminApp 側のアカウント管理画面 (現状は ID + パスワードフォームのみ)
- Migration ツール (パスワードリセットメール送信 vs 仮パスワード付与の判断)
- Security Rules の Custom Claims 設計 (`role: 'admin'` の付与経路)

---

## 3. テナント ID / clientId の扱い

### 3.1 決定事項

既存の `client.id` (string、人間可読 ID) を Firestore の `tenantId` として継続使用するか、Firestore autoId に置き換えるか。

### 3.2 推奨案: 既存 client.id を維持

- 既存 LocalStorage の `hireflow:client:${id}:data` キーや operation logs から `clientId` 参照が大量に存在
- 子アカウントの `parentId` 参照、URL パラメータ、サポート対応時の問い合わせなど、人間が読める ID の方が運用しやすい
- Firestore は doc ID に任意 string を使えるため、autoId 強制ではない
- Migration 時の変換も「そのまま `tenants/{client.id}` に流し込む」だけで済む

### 3.3 代替案

- **autoId 化**: Firestore のベストプラクティスではあるが、既存 ID を別 field (`legacyId`) として保持する必要があり、複雑度増加
- **UUID v4 生成**: 同上

### 3.4 未決リスク

- ID 戦略が決まらないと Migration スクリプトと `tenants` collection の doc ID 設計が確定しない
- 後から変更すると、operation logs の `target: 'client/{id}'` 等の文字列参照が壊れる

### 3.5 決定期限

**Phase J-2 着手前** (Firestore Repository 実装の直前)

### 3.6 影響範囲

- Migration ツール
- `resolveDataOwnerId` ヘルパ (`src/repositories/index.ts`)
- Security Rules の `request.auth.token.tenantId` 比較ロジック
- 全 Firestore Repository 実装

---

## 4. ID 型移行方針 (number → string)

### 4.1 決定事項

`Applicant.id / InterviewEvent.id / Status.id / Source.id / Base.id / Job.id / EmailTemplate.id / ExclusionEntry.id / Member.id` を `number` から `string` に変えるか。

### 4.2 推奨案: Firestore 実装前に string 化 PR を分離投入

理由:
- Firestore autoId は string。`number` を維持すると doc ID の自前採番 (max+1) が必要で、並行書込時に衝突
- 既存画面の `a.id === id` (number 比較) は `String(a.id) === id` などで吸収できるが、PR を分離した方がレビューしやすい
- string 化と Firestore 実装を同時にやると PR が肥大化する

実装順:
1. Phase J-1.5 (新設提案): 型を `string` に統一する PR (LocalStorage 側で `String(maxId + 1)` 採番に切替)
2. Phase J-2: Firestore Repository 実装 (autoId をそのまま使える)

### 4.3 代替案

- **number 維持**: Firestore doc ID に `'1234'` の文字列を使う (number id を `String(id)` で吸収)。可能だが将来的に id 競合のリスクあり
- **mixed**: 新規データは autoId、既存データは number。Migration 時に分かれる → 整合性チェックが複雑化

### 4.4 未決リスク

- 型を後で変えると `applicants.find(a => a.id === id)` 系の callsite が大量に壊れる
- Firestore 実装と同時にやると Phase J-2 PR が制御不能サイズになる

### 4.5 決定期限

**Phase J-2 着手前**

### 4.6 影響範囲

- `src/types/index.ts` 全 ID フィールド
- 全 Repository 実装
- 全画面の `id` 比較ロジック (ApplicantList / KanbanBoard / Calendar 等)

---

## 5. PII 保持期限

### 5.1 決定事項

応募者個人情報、添付ファイル、各種ログをいつまで保持するか。

### 5.2 推奨案

| データ | 保持期間 | 削除トリガ | 法的根拠 |
|---|---|---|---|
| `Applicant` (PII 全体) | 3 年 (応募日から) | `dataRetentionUntil` 到来 → Cloud Scheduler 日次バッチで削除 | 個人情報保護法 / 採用業界慣行 |
| `Applicant.files[]` (履歴書等) | applicant と連動 | 同上 | 同上 |
| `stageHistory` | 5 年 (集計用) | applicant 削除時にカスケード削除 (本体と同時) | 採用統計の参照期間 |
| `messageLogs / smsLogs / emailLogs` | 1 年 | 月次バッチで古いものを削除 | プロバイダ側保持期間に合わせる |
| `webhookLogs / apiCallLogs` | 6 ヶ月 | 月次バッチ | デバッグ用途中心 |
| `operationLogs` (クライアント側 / 運営側) | 1 年 | 月次バッチ | 監査要件に従う (要法務確認) |
| `invoices` | 7 年 | 削除しない or アーカイブ | 法人税法 |
| 退会済テナント (`status='cancelled'`) | 90 日 (グレースピリオド) → 全削除 | Cloud Functions | 解約時のリストア要件 |
| Cloud Storage ファイル | applicant の `dataRetentionUntil` と連動 | Lifecycle rule + Functions | 同上 |

### 5.3 代替案

- **無期限保持**: ストレージコスト累積、GDPR / 個人情報保護法のリスク
- **1 ヶ月保持**: 採用業界の慣行 (内定取消対応、再応募者の重複検出) に対して短すぎる

### 5.4 未決リスク

- 期限を決めずに本番リリースすると、`dataRetentionUntil` バッチ削除 (Cloud Scheduler) が組めない → 個人情報蓄積し続ける
- 将来「全削除」を法務要請で実行する際に、整合性 (stageHistory / events / messageLogs のカスケード) が崩れる
- 退会テナントのデータをいつまで保持するかが決まらないと、Migration ツール側の `cancellationDate` 処理が書けない

### 5.5 決定期限

**Phase J-6 着手前** (Cloud Functions 整備のタイミング)。法務 / コンプライアンス担当のレビュー必須。

### 5.6 影響範囲

- Cloud Functions の Scheduled batch
- `Applicant.dataRetentionUntil` の自動付与ロジック (現状は applicantLifecycle で付与)
- Cloud Storage の Lifecycle Rule
- AdminApp の解約フロー (現状 `cancellationDate` 手動設定)

---

## 6. Cloud Storage のファイルサイズ上限・許可 mimeType

### 6.1 決定事項

`Applicant.files[]` (履歴書 / 職務経歴書 / 写真等) の最大サイズと許可される mimeType。

### 6.2 推奨案

| 項目 | 推奨値 |
|---|---|
| ファイルサイズ上限 | 10 MB / file |
| 1 応募者あたりの合計サイズ | 50 MB |
| 許可 mimeType | `application/pdf` / `image/jpeg` / `image/png` / `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx) / `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx) / `text/csv` |
| ファイル名 | サニタイズ + uuid prefix (`{fileId}_{原ファイル名}`)、原ファイル名は metadata に保持 |
| ウイルススキャン | Cloud Storage trigger + Cloud Functions で ClamAV 連携 (任意、コスト要相談) |

### 6.3 代替案

- **無制限**: ストレージコスト爆発
- **2 MB 制限**: 履歴書 PDF (2-3 MB が一般的) で不足
- **mimeType チェックなし**: 実行可能ファイルが上がる悪用リスク

### 6.4 未決リスク

- 上限が決まらないと Storage Rules (`request.resource.size < N`) が書けない
- mimeType ホワイトリスト無しで本番リリースすると、`.exe` / `.zip` 等が任意にアップロードされる
- ウイルススキャン要否が決まらないと、Cloud Functions のスコープが見積もれない

### 6.5 決定期限

**Phase J-7 着手前** (Cloud Storage 添付実装のタイミング)

### 6.6 影響範囲

- `storage.rules`
- `src/client/components/` のファイルアップロード UI (mimeType チェック画面側でも実装)
- Cloud Functions (ウイルススキャン採用時)
- Migration ツール (移行時の base64 → Storage put でのサイズ検証)

---

## 7. SMS / メール本送信サービスとの接続境界

### 7.1 決定事項

外部送信サービス (Twilio / SendGrid 等) と本リポの境界をどう定義するか。書込責務は誰が持つか。

### 7.2 推奨案: 「draft 作成 + 結果反映」モデル

| ステップ | 担当 | 操作 |
|---|---|---|
| 1. 連絡内容作成 | ATS (本リポ) | 画面から `messageRepository.create({channel, status: 'draft'})` で MessageLog を生成 |
| 2. プロバイダ送信キュー投入 | 別サービス | Cloud Functions or 別 microservice が `status='draft'` を pull → 加工 → プロバイダ API 呼出 |
| 3. プロバイダ送信完了 | 別サービス | `messageRepository.updateStatus(id, 'sent', { sentAt })` で結果反映 |
| 4. 配信ステータス Webhook 受信 | 別サービス | `delivered / opened / clicked / replied / bounced / failed` を Webhook で受信 → `updateStatus` |

### 7.3 代替案

- **A. ATS 内で直接送信**: Twilio SDK / SendGrid SDK を ATS に組み込む。高速だが、認証情報 (apiKey) の管理 / リトライキュー / コスト分離 / 法令対応がすべて ATS に乗る → 推奨しない
- **B. 完全別 DB**: 別サービス側に独自の MessageLog 相当を持ち、ATS には何も書かない。連絡履歴を ATS で表示できなくなる → 推奨しない
- **C. Pub/Sub 経由**: 別サービスが Pub/Sub の event を購読する。スケーラビリティ高いが初期実装コスト大

### 7.4 未決リスク

- 境界が決まらないと、どちらの実装担当も `MessageLog.status` の遷移責任を持たない宙ぶらりん状態に
- `draft` を pull する権限 (Cloud Functions Service Account) の Security Rules 設計が確定しない
- 連絡履歴画面 (ApplicantDetail) が「送信中」状態を表現できない

### 7.5 決定期限

**Phase J-2 (MessageRepository Firestore 化) 着手前**。別サービス担当との合意が前提。

### 7.6 影響範囲

- `src/repositories/firestore/messageRepository.ts`
- `messageLogs / smsLogs / emailLogs` collection の Security Rules
- 別サービス側の認証 (Service Account / API key)
- ApplicantDetail の連絡履歴 UI (`status='draft'` の表示)

---

## 8. Backup / Rollback 方針

### 8.1 決定事項

Firestore のバックアップ戦略 と Migration 失敗時の Rollback 手順。

### 8.2 推奨案

#### 8.2.1 Backup

| 種別 | 方式 | 頻度 | 保持期間 |
|---|---|---|---|
| Point-in-Time Recovery (PITR) | Firestore 設定で有効化 | 連続 | 7 日 (Firestore 標準) |
| Scheduled Export | Cloud Scheduler → `gcloud firestore export` → GCS bucket | 日次 | 30 日 |
| 月次フルバックアップ | 月初に GCS の別バケットに長期保存 | 月次 | 1 年 |

#### 8.2.2 Migration Rollback

| ステップ | 動作 |
|---|---|
| 1. Hybrid 期間 (1〜2 週間) | Firestore + LocalStorage に dual-write。読込は段階的に Firestore へ |
| 2. 検証 | 整合性チェックスクリプト + ユーザーフィードバック |
| 3. 問題なし | LocalStorage 廃棄 (Phase J-9 完了) |
| 4. 問題あり | `src/repositories/index.ts` の 1 行差し替えで LocalStorage 単独運用に戻す。Firestore 側差分は admin が手動 sync |

### 8.3 代替案

- **PITR のみ**: 7 日超の障害で復旧不可
- **scheduled export なし**: 規模が大きくなるとコスト改善余地はあるが、初期は両方推奨
- **Hybrid 期間なしで一気切替**: 失敗時のリスク大

### 8.4 未決リスク

- バックアップ戦略が決まらないと「データを失った場合」の SLA がコミットできない
- Hybrid 期間中の rollback 手順を文書化しておかないと、現場判断で復旧手順が変わる
- 整合性チェックスクリプト (`handoff §8`) と組み合わせて運用するため、両方一緒に決める必要

### 8.5 決定期限

**Phase J-8 着手前** (Migration ツール + Hybrid 期間設計のタイミング)

### 8.6 影響範囲

- インフラ担当: PITR 有効化 / GCS バケット作成 / Cloud Scheduler 設定
- Migration ツール: dual-write モード切替フラグ
- 運用担当: rollback 手順書作成
- `docs/production-handoff-checklist.md §9.4 / §9.6` のチェック項目

---

## 9. Security Rules / Custom Claims の運用

### 9.1 決定事項

Custom Claims をどう発行するか、child の baseName 制限をどこで強制するか、admin 権限の付与経路。

### 9.2 推奨案

#### 9.2.1 Custom Claims 設計

```ts
{
  tenantId: string,
  accountType: 'parent' | 'child' | 'admin',
  baseName?: string,       // child のみ
  accountId: string,
  role?: 'admin'           // 運営のみ
}
```

#### 9.2.2 強制ポイント

| ポイント | 場所 |
|---|---|
| child の baseName 越え書込禁止 | **画面側 (現状) + Firestore Security Rules (新規)** の多重防御 |
| stageHistory の update / delete 禁止 | Rules 側で `false` (admin のみ) |
| operationLogs / messageLogs append | **Cloud Functions 経由のみ** (画面側 write は Rules で拒否) |
| admin claim 付与 | **Cloud Functions Admin SDK 経由のみ** (一般ユーザーは自前発行不可) |
| Custom Claims 更新 | child の baseName 変更時 → Cloud Functions HTTP API |
| Token refresh | claim 変更後に画面側で `getIdToken(true)` を呼ぶ |

### 9.3 代替案

- **画面側のみで制限**: Rules を緩く設定。バグ / 攻撃で簡単に越境可能 → 推奨しない
- **Custom Claims 不使用、Firestore lookup で都度判定**: Rules 内で Firestore lookup は遅延 / コスト高 → 推奨しない
- **admin 権限を Firestore doc field で管理**: claim と doc 二重管理になり整合性事故 → 推奨しない

### 9.4 未決リスク

- 多重防御が無いと、画面 bypass 攻撃で他テナント / 他拠点のデータを見られる
- admin claim の付与経路が決まらないと、新規運営者を追加できない (= リリース後の運用が回らない)
- claim 更新の token refresh タイミングが曖昧だと、baseName 変更直後に画面が固まる

### 9.5 決定期限

**Phase J-1 着手前** (Firebase 基盤セットアップで Auth / Rules を有効化する直前)

### 9.6 影響範囲

- `firestore.rules` 全体
- Cloud Functions の Custom Claims 管理 API
- AdminApp のアカウント追加フロー
- AuthContext の token refresh ロジック (claim 変更後)

---

## 10. 監査ログの改竄検知 (hash chain)

### 10.1 決定事項

`tenants/{tid}/operationLogs` および `/admins/{aid}/operationLogs` の改竄検知 hash chain を Cloud Functions で実装するか、それとも append-only + IAM 制約のみで済ませるか。

### 10.2 推奨案: Cloud Functions による append-only + chain hash

理由:
- 既存 admin 側 (`src/admin/adminAuth.ts`) で FNV-1a chain hash を実装済 → サーバ側に移植するだけで継続性が保てる
- Security Rules で `create: if false` にして画面 write を完全遮断 → Cloud Functions HTTP API 経由のみで append
- chain は前 entry の hash を含むため、過去 log の差し替えで chain が崩れる → 検知可能

#### 実装方針

| ステップ | 動作 |
|---|---|
| 1. 画面が log を書きたい | Cloud Functions HTTP API に payload を投げる |
| 2. Cloud Functions | 直前 entry の hash を読み出す → 新 entry の `(timestamp + operator + category + action + target + detail)` を canonical JSON 化 → FNV-1a で hash 計算 → Firestore に append |
| 3. 検証 | 監査時に全 log を順に読み chain を再計算、保存 hash と一致するか確認 |

### 10.3 代替案

- **A. append-only のみ (chain なし)**: Rules で `update: if false` だけ強制。簡単だが、誰かが Admin SDK 権限を握ったら過去 log を改竄可能
- **B. BigQuery export**: Firestore の changes を BigQuery に流す。改竄不可だが、初期実装コスト + クエリ分離コスト大
- **C. 外部 audit サービス**: AWS CloudTrail 相当のサービス連携。コスト高

### 10.4 未決リスク

- chain なしで監査要件を満たせない契約 (大手企業 / 金融系) があると、後付けで全 log 再計算が必要
- 採用しない場合、現状の `adminAuth.ts` の chain ロジックが localStorage 廃棄と同時に消える

### 10.5 決定期限

**Phase J-6 着手前** (Cloud Functions 整備のタイミング)

### 10.6 影響範囲

- Cloud Functions: hash chain 計算ロジックの新設
- `firestore.rules`: operationLogs の `create: if false`
- 画面側: 直接 write していた経路を Cloud Functions API 呼出に変更
- 既存 chain hash の Migration: 旧 chain は破棄 / 移行直後から新 chain で再構築

---

## 11. コスト上限・レート制限

### 11.1 決定事項

Anthropic API / Firestore reads・writes / Cloud Storage の月額上限とアラート閾値。

### 11.2 推奨案

| 種別 | 上限 / レート | アラート閾値 |
|---|---|---|
| Anthropic API (AI スクリーニング) | テナント単位の月額上限 (要 PO 決定) | 80% / 100% で通知 |
| Anthropic API レート制限 | 1 テナント 60 req/min, 1 ユーザー 10 req/min | exceed 時 429 |
| Firestore reads | 想定 QPS の 2 倍まで許容 (バースト) | 想定の 1.5 倍超でアラート |
| Firestore writes | 同上 | 同上 |
| Cloud Storage 容量 | テナント単位 50 GB (推奨案 §6.2 の 50 MB/applicant × 1000 applicants 想定) | 80% で通知 |
| Cloud Functions invocations | 月額上限 (要 PO 決定) | 80% で通知 |

### 11.3 代替案

- **無制限**: ランナウェイコスト / DDoS 起点
- **画一的な上限**: 大手テナント不公平。プラン別に変える方が筋

### 11.4 未決リスク

- 上限なしで本番運用すると、AI スクリーニング 1 件あたり数円 × 暴走で月額数万〜数十万のリスク
- レート制限なしで悪意あるユーザーが連続 API call → 他テナントに影響
- アラート閾値が決まらないと、SRE 担当が監視ダッシュボードを組めない

### 11.5 決定期限

**Phase J-6 着手前** (Cloud Functions 整備のタイミング)。**プラン別の上限を契約と紐付けるなら J-1 までに**。

### 11.6 影響範囲

- Cloud Functions: rate limit middleware / 月額カウンタ
- AdminApp: テナント別の上限設定 UI (将来要件)
- Cloud Logging / Monitoring: アラート設定
- 契約・請求まわり (PO / 経理担当)

---

## 12. E2E / Staging Gate

### 12.1 決定事項

本番リリース前に必須通過とするテスト項目と、staging 滞留期間。

### 12.2 推奨案

#### 12.2.1 Staging 滞留期間

- 最低 **1 週間** dual-write モードで運用
- 期間中、`docs/production-handoff-checklist.md §8` の整合性チェックを毎日実施

#### 12.2.2 必須通過項目

| カテゴリ | 項目 | 出典 |
|---|---|---|
| 機能 E2E | ログイン / 応募者 CRUD / ステージ変更 / 面接予約・キャンセル / レポート / AI スクリーニング / ファイル添付 / 子アカウント拠点フィルタ | handoff §9.1 |
| Security Rules | Emulator テストスイート全 pass / 子アカウント越境テスト | handoff §9.2 |
| Cloud Functions | hash chain / dataRetentionUntil / cancellationDate / API 呼出 | handoff §9.3 |
| Migration | 整合性チェック全 pass / パスワードリセット完了率 100% / hybrid 期間中の差分なし | handoff §9.4 / §8 |
| 監視 | アラート設定全配備 / Sentry 配備 | handoff §9.5 |
| 性能 / 信頼性 | 負荷試験 / PITR 確認 / DR ドリル / Rules pen test / Storage retention | handoff §9.5.1 |
| Rollback | 復元手順書あり / 切り戻しを 1 度試走済 | handoff §9.6 |

#### 12.2.3 Go / No-Go 判定者

- PO + 開発リード + SRE 担当の 3 名合意で Go
- どれか 1 名が No-Go なら staging 延長

### 12.3 代替案

- **Staging 滞留 1 日**: 短すぎる。週末を挟まないと検証できないケースあり
- **Staging スキップ**: NG (3 環境分離した意味が消える)
- **No-Go 判定者を 1 名**: SPOF。最低 3 名推奨

### 12.4 未決リスク

- Gate 基準が決まらないと「いつ本番切替できるか」が常に曖昧
- 切替判断が個人裁量になると、後から責任問題に発展
- Migration の検証期間が短すぎると、Phase J-9 後に深刻な問題発覚

### 12.5 決定期限

**Phase J-9 着手前** (本番切替の直前)。理想は J-1 までに合意して、各 Phase の DoD として組み込む。

### 12.6 影響範囲

- 全実装担当 (各 PR の DoD)
- QA / SRE 担当
- PO の意思決定プロセス
- リリースノート / 顧客告知のタイミング

---

## 13. 決定が遅れた場合の連鎖リスク

下記は「上流の決定が遅れることで下流の Phase が止まる」依存関係。

| 上流の決定 | 下流でブロックされる作業 |
|---|---|
| §1 環境分離 | Phase J-1 全体。Firebase project 数が決まらないと CI/CD が組めない |
| §2 認証方式 | Phase J-3 / J-4 (FirebaseAuthService 実装 / AuthContext async 化) |
| §3 tenantId / §4 ID 型 | Phase J-2 全体 (全 Firestore Repository) |
| §5 PII 保持期限 / §10 hash chain / §11 コスト | Phase J-6 (Cloud Functions 整備) |
| §6 ファイル制限 | Phase J-7 (Cloud Storage 添付) |
| §7 SMS 境界 | Phase J-2 (MessageRepository Firestore 化) + 別サービス側実装 |
| §8 Backup / §12 Gate | Phase J-8 / J-9 (Migration + 切替) |
| §9 Security Rules | Phase J-1 全体 |

---

## 14. 推奨意思決定スケジュール

各 Phase を待たずに、**まとめて以下のタイミングで合意**するのが望ましい。

| タイミング | 合意項目 |
|---|---|
| Kick-off Meeting (Phase J-1 着手前) | §1 / §2 / §3 / §4 / §9 / §12 (基盤に直結する 6 項目) |
| Phase J-5 着手前 | §7 (SMS 境界) |
| Phase J-6 着手前 | §5 / §10 / §11 (Cloud Functions 設計に直結する 3 項目) |
| Phase J-7 着手前 | §6 (Storage 設計) |
| Phase J-8 着手前 | §8 (Migration / Backup) |

---

## 15. 本書の運用

- 各項目に **決定者 / 決定日 / 決定内容** を追記しながら更新する
- 決定済項目は ✅ マークを付け、本文の「推奨案 / 代替案」を残しつつ「決定: XXX」を冒頭に追記
- 全項目決定済になったら本書を `docs/production-decisions-history.md` (履歴版) にリネームし、handoff §10.6 の「未確定項目」節を「決定済項目」に書き換える

---

## 16. 関連文書

| 文書 | 関連 |
|---|---|
| `docs/production-handoff-checklist.md` | 本書の実装担当向けインデックス。§10.6 で本書と同等の未確定項目を列挙しているが、推奨案 / 期限はそちらには無い |
| `src/repositories/firestore-design.md` | 本書の各項目に対する技術設計案 |
| `src/repositories/README.md` | Repository 設計方針 |
| `src/services/auth/README.md` | AuthService 境界 |

---

## 17. 補足対応履歴

- v1 初版 (2026-05-10): Phase A〜I 完了直後 / Phase J 着手前のオープン項目を 12 項目で整理
