# Firestore / Firebase 実装担当向けハンドオフ

> **作成日**: 2026-05-13
> **対象**: Firestore / Firebase Auth / Cloud Storage を実装する担当エンジニア
> **目的**: 実装に入る前の現在地、触ってよい境界、最初の着手順を 1 枚で把握できるようにする。
> **重要**: このフェーズでは本リポ側で Firebase SDK 導入・Firestore 実装・Auth 差し替えは開始しない。実装は担当エンジニアへ引き継ぐ。

---

## 1. 現在地

Repository / AuthService 境界の整理は完了済み。画面・管理画面から保存先を直接触る経路は、原則として Repository / Service の内側に閉じ込められている。

| 領域 | 状態 |
|---|---|
| Phase N 設定系 10 画面 | ✅ 完了 |
| Phase O-1〜O-5 整理 | ✅ 完了 |
| Phase O-6 AdminApp storage 直叩き整理 | ✅ 完了 |
| `src/admin` / `src/client` の `storage.*ClientData` 直叩き | ✅ 0 件 |
| `src/admin` / `src/client` の raw `localStorage.*hireflow:client` 直叩き | ✅ 0 件 |
| Firestore / Firebase Auth / Cloud Storage 実装 | ⛔ 未着手、別担当へ引き継ぎ |

現時点の実装はまだ localStorage / sessionStorage ベース。Firestore 化は「既存 interface を満たす Firestore 実装を追加し、最後に `src/repositories/index.ts` / `src/services/auth/index.ts` を差し替える」段階から開始する。

---

## 2. 最初に読むファイル

この順番で読むと全体像を追いやすい。

| 順 | ファイル | 目的 |
|---|---|---|
| 1 | `docs/firestore-engineer-handoff.md` | このファイル。現在地と着手境界 |
| 2 | `docs/production-handoff-checklist.md` | 完了済み範囲、推奨 PR 順、本番前チェックリスト |
| 3 | `src/repositories/firestore-design.md` | Firestore collection / index / transaction / migration / rules 設計 |
| 4 | `src/repositories/README.md` | Repository 移行履歴、非同期化方針、各 Phase の注意点 |
| 5 | `src/repositories/types.ts` | Firestore 実装が満たすべき Repository interface |
| 6 | `src/repositories/localStorage/*.ts` | 既存挙動の正本。Firestore 実装時のロジック参照元 |
| 7 | `src/services/auth/README.md` / `src/services/auth/types.ts` | AuthService 境界と Firebase Auth 差し替え方針 |
| 8 | `src/types/index.ts` | データ型定義の正本 |

---

## 3. 触ってよいもの / まだ触らないもの

### 触ってよいもの

- `src/repositories/firestore/` の新規追加
- `src/services/auth/firebase/` の新規追加
- `firebase.json` / `firestore.rules` / `firestore.indexes.json` / `storage.rules`
- migration / export / import / consistency check 用の新規ツール
- Emulator / CI 用の設定
- Firestore 実装のテスト

### 最初の PR では触らない方がよいもの

- `src/repositories/index.ts` の本番差し替え
- `src/services/auth/index.ts` の本番差し替え
- 既存 React 画面の一括 async 化
- 既存 Repository interface の一括 `Promise<T>` 化
- UI 文言・画面構成・業務仕様
- SMS / メール本送信

理由: Firestore 化は認証・権限・DB・Storage・移行をまたぐため、最初から差し替えると rollback が難しい。まず Firestore 実装を localStorage 実装と並べて追加し、Emulator とテストで同等性を確認してから切り替える。

---

## 4. 推奨 PR 順

| PR | 内容 | 目的 |
|---|---|---|
| 1 | Firebase 基盤だけ追加 | Emulator / rules / indexes / env skeleton。既存挙動に影響を出さない |
| 2 | FirestoreClientRepository / FirestoreClientDataRepository | tenant / accounts / god-object 分解の土台 |
| 3 | FirestoreApplicantRepository | 最重要データ。stageHistory / duplicate / cascade の同等性確認 |
| 4 | FirestoreEventRepository | scheduleInterview / cancel / reschedule の transaction 境界確認 |
| 5 | FirestoreStatusRepository / MessageRepository / ReportRepository | 比較的独立した Repository を追加 |
| 6 | BaseRepository / SlotRepository | base 削除 cascade は Cloud Functions 連携を前提に設計 |
| 7 | 設定系 Repository 群 | Phase N で interface は整っているため実装差し替えに集中 |
| 8 | FirebaseAuthService | Firebase Auth / Custom Claims / session 復元 |
| 9 | AuthContext async 化 | loading / error / token refresh を導入 |
| 10 | Cloud Storage 添付 | Applicant.files を Storage path + metadata doc へ |
| 11 | Migration / Export / Import | localStorage data を Firestore へ投入 |
| 12 | `index.ts` 差し替え + hybrid / rollback | 本番切替 |

「1 PR = 1 Repository または 1 境界」を守る。全 Repository を一括 Promise 化する PR は避ける。

---

## 5. 必ず守る不変条件

| 不変条件 | 理由 |
|---|---|
| child は自拠点 (`baseName`) 以外の applicant / event を読書きできない | 画面側だけでなく Security Rules / Custom Claims でも強制する |
| `stageHistory` は監査データとして壊さない | 削除・編集ルールを厳格化し、必要なら Cloud Functions 経由 |
| password / passwordHash を Firestore に保存しない | Firebase Auth に寄せる |
| 媒体 API key は平文保存しない | Secret Manager / KMS を検討 |
| 添付ファイル本体を Firestore に入れない | Cloud Storage に置き、Firestore は metadata のみ |
| 2 段 save だった処理は transaction / batch 候補として扱う | 部分成功による不整合を防ぐ |
| `src/admin` / `src/client` から storage / raw localStorage 直叩きを復活させない | O-6 完了で消した境界を保つ |

---

## 6. 移行前の確認コマンド

Firestore 実装に入る前に、現在の境界が崩れていないことを確認する。

```bash
rg "storage\.(getClientData|saveClientData|deleteClientData)" src/admin src/client
rg "localStorage\.(getItem|setItem|removeItem).*hireflow:client" src/admin src/client
rg "updateClientData\(" src
npm run build
```

期待:

- 1 つ目: 0 件
- 2 つ目: 0 件
- 3 つ目: 0 件
- build pass

Repository 内部 (`src/repositories/localStorage/*.ts`) や `storage.ts` / `clientLog.ts` が localStorage を触るのは正常。画面・管理画面が直接触っていないことを見る。

---

## 7. 未決定論点

実装前に担当エンジニア / PM / 運用側で合意しておく。

| 論点 | 候補 |
|---|---|
| Firebase project 構成 | dev / staging / prod を分けるか |
| Auth 移行 | パスワードリセットメール方式か、仮パスワード初回変更方式か |
| Custom Claims 付与 | Cloud Functions HTTP API か Auth onCreate trigger か |
| ID 型 | number を移行時に string / autoId へ寄せるか、互換層で吸収するか |
| tenant copy | Cloud Functions 専用 API にする範囲と権限 |
| base 削除 cascade | Cloud Functions で server-side cascade に寄せるか |
| logs hash chain | Cloud Functions append-only にするタイミング |
| hybrid 期間 | dual-write を何週間運用するか |
| rollback | localStorage 単独運用へ戻す条件と手順 |

---

## 8. 引き継ぎ時の一言まとめ

ここまでの作業で、RISOTTO の画面コードは保存先に直接依存しない形まで整理済み。次の担当者は Firebase SDK を入れて即差し替えるのではなく、まず Firestore / Firebase Auth / Cloud Storage の実装を既存 interface の横に追加し、Emulator と migration 検証で localStorage 実装と同じ挙動を確認してから切り替える。

