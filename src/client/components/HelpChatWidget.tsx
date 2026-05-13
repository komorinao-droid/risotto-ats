import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleHelp,
  Copy,
  ListChecks,
  MessageCircle,
  Search,
  Send,
  Settings,
  Sparkles,
  Tags,
  UserPlus,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type HelpCategoryId =
  | 'applicants'
  | 'statuses'
  | 'interviews'
  | 'reports'
  | 'screening'
  | 'account';

interface HelpLink {
  label: string;
  href: string;
}

interface HelpQuestion {
  id: string;
  title: string;
  /** 1〜2行の導入文（必須） */
  intro: string;
  /** 番号付き手順。省略時は intro と note のみの簡易回答 */
  steps?: string[];
  /** 補足・注意点 */
  note?: string;
  /** 関連画面リンク（SPA遷移） */
  link?: HelpLink;
}

interface HelpCategory {
  id: HelpCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** カテゴリ色（バッジの濃色） */
  accent: string;
  /** カテゴリ色（バッジの淡色背景） */
  accentSoft: string;
  questions: HelpQuestion[];
}

interface HelpShortcut {
  label: string;
  icon: LucideIcon;
  categoryId: HelpCategoryId;
  questionId: string;
}

const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'applicants',
    label: '応募者の追加',
    description: '応募者登録、CSV取込、重複表示',
    icon: UserPlus,
    accent: '#f97316',
    accentSoft: '#ffedd5',
    questions: [
      {
        id: 'add-single',
        title: '応募者を1人ずつ追加するには？',
        intro: '応募者管理画面から、フォームで1人ずつ追加できます。',
        steps: [
          '左メニューの「応募者管理」を開く',
          '画面上部の「応募者追加」ボタンを押す',
          '氏名・電話番号・応募職種・応募媒体・拠点を入力して保存',
        ],
        note: '同じ氏名または電話番号の応募者がいると、自動で重複候補として検知されます。',
        link: { label: '応募者一覧を開く', href: '/applicants' },
      },
      {
        id: 'csv-import',
        title: 'CSVでまとめて取り込むには？',
        intro: '応募者管理画面のCSV取込から、複数応募者を一括登録できます。',
        steps: [
          '左メニューの「応募者管理」を開く',
          '「CSV取込」からファイルを選択',
          '取込結果を確認し、エラー行があれば修正後に再取込',
        ],
        note: 'ステータス列が空なら初期ステータスが入ります。明示されたステータスは履歴として記録されます。文字化け防止のため UTF-8 推奨。',
        link: { label: '応募者一覧を開く', href: '/applicants' },
      },
      {
        id: 'duplicate',
        title: '重複応募はどこで確認できますか？',
        intro: '応募者一覧と詳細画面で、重複候補が自動表示されます。',
        steps: [
          '応募者一覧を開く',
          '重複アイコン/フラグが付いた行を確認',
          '詳細画面で氏名・電話・メールを照合して同一人物か判断',
        ],
        note: 'CSV出力用の重複フラグも自動更新されます。',
        link: { label: '応募者一覧を開く', href: '/applicants' },
      },
    ],
  },
  {
    id: 'statuses',
    label: 'ステータス管理',
    description: 'ステータス変更、対象外の扱い',
    icon: Tags,
    accent: '#10b981',
    accentSoft: '#d1fae5',
    questions: [
      {
        id: 'status-change',
        title: '応募者のステータスを変更するには？',
        intro: '一覧・進捗ボード・詳細画面のいずれからでも変更できます。',
        steps: [
          '応募者一覧/進捗ボードの該当行・カードのステータス欄を開く',
          '変更後のステータスを選択',
          '理由やメモを残したい場合は詳細画面から変更',
        ],
        note: '対象外（辞退・不合格など）に変更すると、アクティブな選考対象から外れます。',
        link: { label: '応募者一覧を開く', href: '/applicants' },
      },
      {
        id: 'status-excluded',
        title: '対象外（辞退・不合格など）の扱いはどうなりますか？',
        intro: '対象外ステータスに変更しても、データは保持されたままで再開可能です。',
        steps: [
          '応募者詳細または一覧でステータスを「対象外」系へ変更',
          'カウントや進捗ボードから自動的に除外される',
          '誤って対象外にした場合は、同じ操作でアクティブなステータスへ戻す',
        ],
        note: '対象外でも検索・絞り込みでヒットするため、後から再応募の判断にも使えます。',
        link: { label: 'ステータス管理を開く', href: '/statuses' },
      },
    ],
  },
  {
    id: 'interviews',
    label: '面接日程',
    description: '日程登録、面接方法・メモ、カレンダー',
    icon: CalendarDays,
    accent: '#6366f1',
    accentSoft: '#e0e7ff',
    questions: [
      {
        id: 'interview-book',
        title: '面接日時を登録するには？',
        intro: '応募者詳細または面接カレンダーから、面接予定を登録します。',
        steps: [
          '応募者詳細の「面接予定」または面接カレンダーを開く',
          '日付・時間帯・拠点・面接方法を入力',
          '保存するとカレンダーに反映され、ステータスも面接確定へ更新',
        ],
        note: '時間帯の空き枠は面接カレンダーで事前確認できます。',
        link: { label: '面接カレンダーを開く', href: '/calendar' },
      },
      {
        id: 'interview-method-memo',
        title: '面接方法や面接メモはどこで管理しますか？',
        intro: '予定作成・編集時に面接方法を選択し、応募者詳細にメモを残せます。',
        steps: [
          '予定編集画面で「対面 / オンライン / 電話」を選択',
          '応募者詳細の面接欄、または予定詳細でメモを入力',
          'キャンセル・変更時の経緯も同じ場所に追記',
        ],
        note: 'メモは次回面接や合否判断、引き継ぎ時の参考になります。',
        link: { label: '面接カレンダーを開く', href: '/calendar' },
      },
      {
        id: 'interview-calendar',
        title: 'カレンダーで日程や枠数を確認・調整するには？',
        intro: '面接カレンダーから拠点別に予定・空き枠を一覧できます。',
        steps: [
          '面接カレンダーを開いて拠点を切り替え',
          '日別・時間帯別の予定や空き枠を確認',
          '一括設定で曜日や期間を指定して枠数を調整',
        ],
        note: '予定の重複や空き枠不足はカレンダー上で見えるので、登録前確認でミスを減らせます。',
        link: { label: '面接カレンダーを開く', href: '/calendar' },
      },
    ],
  },
  {
    id: 'reports',
    label: 'レポート',
    description: '採用レポート、媒体費、PDF/Excel',
    icon: BarChart3,
    accent: '#0ea5e9',
    accentSoft: '#e0f2fe',
    questions: [
      {
        id: 'report-open',
        title: '採用レポートはどこから見られますか？',
        intro: '採用レポートオプションが有効な場合、サイドバーまたは設定から開けます。',
        steps: [
          '左メニューの「採用レポート」または設定内の該当項目を開く',
          'ファネル分析・月次推移・媒体費用分析タブを切り替えて確認',
          '対象期間と拠点・媒体を絞り込んで分析',
        ],
        note: 'オプション未契約の場合は案内画面が表示されます。',
        link: { label: '採用レポートを開く', href: '/reports' },
      },
      {
        id: 'cost-manage',
        title: '媒体費用はどこで入力しますか？',
        intro: '採用レポートのコスト分析タブで、月別・媒体別の費用を入力します。',
        steps: [
          '採用レポートを開く',
          '「コスト分析」タブを選択',
          '月別・媒体別に費用を入力して保存',
        ],
        note: '入力した費用は CPA / CPH の自動計算に使われます。',
        link: { label: '媒体費用管理を開く', href: '/media-costs' },
      },
      {
        id: 'export-report',
        title: 'レポートを出力できますか？',
        intro: 'CSV / Excel / 印刷PDF の3形式で出力できます。',
        steps: [
          '採用レポート画面で対象期間・拠点・媒体を絞り込む',
          '画面右上の出力ボタンから形式を選択',
          'PDF出力は印刷ダイアログを経由（A4縦推奨）',
        ],
        note: '提出資料にする場合は、絞り込み条件をスクリーンショットで残しておくと再現が容易です。',
        link: { label: '採用レポートを開く', href: '/reports' },
      },
    ],
  },
  {
    id: 'screening',
    label: 'AIスクリーニング',
    description: '評価条件、NG条件、判定結果',
    icon: Sparkles,
    accent: '#a855f7',
    accentSoft: '#f3e8ff',
    questions: [
      {
        id: 'screening-axes',
        title: 'AIスクリーニング条件はどう考えればよいですか？',
        intro: '評価軸 + 重み + 必須/望ましい条件、を職種ごとに組み立てます。',
        steps: [
          '設定 > AIスクリーニングを開く',
          '評価軸（経験・適性・勤務条件など）と重みを入力',
          '職種ごとに優先順位を変える場合は職種別設定で上書き',
        ],
        note: '最初から完璧を狙わず、運用しながら重みや条件を調整すると精度が安定します。',
        link: { label: 'AIスクリーニング設定を開く', href: '/settings/screening' },
      },
      {
        id: 'screening-ng',
        title: 'NG条件（落としたい条件）はどう設定しますか？',
        intro: '「必須条件」「除外条件」で、満たさない場合に不適合と判定したい項目を設定します。',
        steps: [
          '設定 > AIスクリーニングを開く',
          '「必須条件 / 除外条件」セクションに勤務地・年齢・経験などを入力',
          '職種別に変えたい場合は職種ごとの条件設定で個別上書き',
        ],
        note: '除外要件はここで明確にしておくと判定がブレません。',
        link: { label: 'AIスクリーニング設定を開く', href: '/settings/screening' },
      },
      {
        id: 'screening-result',
        title: 'AI判定結果はどこで確認しますか？',
        intro: '応募者詳細のAIスクリーニング欄にスコアと評価コメントが表示されます。',
        steps: [
          '応募者一覧/詳細を開く',
          '一覧では AI評価でソート・絞り込みが可能',
          '詳細画面で評価軸ごとのコメントを確認',
        ],
        note: 'AI評価は判断材料の1つです。最終判断は必ず担当者が内容を確認してください。',
        link: { label: '応募者一覧を開く', href: '/applicants' },
      },
    ],
  },
  {
    id: 'account',
    label: 'アカウント/拠点設定',
    description: '拠点、職種、権限、通知先',
    icon: Settings,
    accent: '#ef4444',
    accentSoft: '#fee2e2',
    questions: [
      {
        id: 'base-manage',
        title: '拠点を追加・編集するには？',
        intro: '拠点管理画面から追加・編集・削除ができます。',
        steps: [
          '左メニューの「拠点管理」を開く',
          '「追加」または既存拠点の編集',
          '削除前に対象応募者・予定が紐付いていないか確認',
        ],
        note: '拠点を削除すると、関連する面接予定や拠点別設定も整理されます。',
        link: { label: '拠点管理を開く', href: '/bases' },
      },
      {
        id: 'child-account',
        title: '子アカウントの権限はどこで設定しますか？',
        intro: '設定 > アカウントからメンバー追加・権限・通知設定を管理します。',
        steps: [
          '設定 > アカウントを開く',
          'メンバーを追加し、担当拠点を割り当て',
          '権限と通知設定を保存',
        ],
        note: '子アカウントは担当拠点を基準に、表示範囲が自動で制限されます。',
        link: { label: 'アカウント設定を開く', href: '/settings/account' },
      },
      {
        id: 'job-source',
        title: '職種や応募媒体を管理するには？',
        intro: '職種管理・応募媒体管理画面で、それぞれ追加・編集できます。',
        steps: [
          '左メニューの「職種管理」または「応募媒体管理」を開く',
          '「追加」または既存項目の編集',
          '拠点別に分けたい場合は拠点を選択して専用設定を作成',
        ],
        note: '職種と媒体は応募者登録時の選択肢として使われます。',
        link: { label: '職種管理を開く', href: '/jobs' },
      },
    ],
  },
];

const POPULAR_SHORTCUTS: HelpShortcut[] = [
  { label: '応募者を追加したい', icon: UserPlus, categoryId: 'applicants', questionId: 'add-single' },
  { label: '面接日程を設定したい', icon: CalendarDays, categoryId: 'interviews', questionId: 'interview-book' },
  { label: 'AI判定を確認したい', icon: Sparkles, categoryId: 'screening', questionId: 'screening-result' },
  { label: '子アカウントの権限を変えたい', icon: Settings, categoryId: 'account', questionId: 'child-account' },
];

function findCategory(id: HelpCategoryId | null): HelpCategory | undefined {
  return HELP_CATEGORIES.find((category) => category.id === id);
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

const HelpChatWidget: React.FC = () => {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<HelpCategoryId | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selectedCategory = findCategory(categoryId);
  const selectedQuestion = selectedCategory?.questions.find((question) => question.id === questionId);

  const searchResults = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    return HELP_CATEGORIES.flatMap((category) =>
      category.questions
        .filter((question) => {
          const target = normalize(
            [
              category.label,
              question.title,
              question.intro,
              ...(question.steps || []),
              question.note || '',
            ].join(' '),
          );
          return target.includes(q);
        })
        .map((question) => ({ category, question })),
    );
  }, [query]);

  const contactBody = useMemo(() => {
    const lines = [
      'RISOTTO ATS サポート問い合わせ',
      '',
      `会社名: ${client?.companyName || ''}`,
      `アカウント: ${client?.contactName || client?.id || ''}`,
      `画面URL: ${window.location.pathname}${window.location.search}`,
      `カテゴリ: ${selectedCategory?.label || ''}`,
      `質問: ${selectedQuestion?.title || ''}`,
      '',
      '困っている内容:',
      '',
      '',
      '再現手順:',
      '1. ',
      '2. ',
      '3. ',
    ];
    return lines.join('\n');
  }, [client, selectedCategory, selectedQuestion]);

  const resetToHome = () => {
    setCategoryId(null);
    setQuestionId(null);
    setQuery('');
  };

  const chooseCategory = (id: HelpCategoryId) => {
    setCategoryId(id);
    setQuestionId(null);
    setQuery('');
  };

  const chooseQuestion = (nextCategoryId: HelpCategoryId, nextQuestionId: string) => {
    setCategoryId(nextCategoryId);
    setQuestionId(nextQuestionId);
    setQuery('');
  };

  const copyContactBody = async () => {
    try {
      await navigator.clipboard.writeText(contactBody);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('問い合わせ文をコピーしてください', contactBody);
    }
  };

  const openMail = () => {
    const subject = encodeURIComponent('RISOTTO ATS サポート問い合わせ');
    const body = encodeURIComponent(contactBody);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const goToLink = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  const renderHome = () => (
    <>
      <div className="help-chat-message help-chat-message--bot">
        何についてお困りですか？よく見られる項目から選ぶか、カテゴリ・キーワード検索で探せます。
      </div>

      <div className="help-chat-shortcuts" aria-label="よくある困りごと">
        <div className="help-chat-shortcuts-title">
          <Zap size={14} />
          よくある困りごと
        </div>
        <div className="help-chat-shortcuts-grid">
          {POPULAR_SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <button
                key={`${shortcut.categoryId}-${shortcut.questionId}`}
                className="help-chat-shortcut"
                onClick={() => chooseQuestion(shortcut.categoryId, shortcut.questionId)}
              >
                <Icon size={14} />
                <span>{shortcut.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="help-chat-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例: CSV、面接、レポート"
          aria-label="ヘルプを検索"
        />
      </label>

      {query ? (
        <div className="help-chat-list">
          {searchResults.length > 0 ? (
            searchResults.map(({ category, question }) => (
              <button
                key={`${category.id}-${question.id}`}
                className="help-chat-question"
                onClick={() => chooseQuestion(category.id, question.id)}
              >
                <span>{question.title}</span>
                <small>{category.label}</small>
              </button>
            ))
          ) : (
            <div className="help-chat-empty">
              該当するFAQが見つかりません。問い合わせ文を作成してサポートへ共有してください。
            </div>
          )}
        </div>
      ) : (
        <div className="help-chat-categories">
          {HELP_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const styleVars = {
              '--accent': category.accent,
              '--accent-soft': category.accentSoft,
            } as React.CSSProperties;
            return (
              <button
                key={category.id}
                className="help-chat-category"
                style={styleVars}
                onClick={() => chooseCategory(category.id)}
              >
                <span className="help-chat-category-badge" aria-hidden>
                  <Icon size={20} />
                </span>
                <strong>{category.label}</strong>
                <small>{category.description}</small>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  const renderCategory = () => {
    if (!selectedCategory) return null;
    const Icon = selectedCategory.icon;
    const styleVars = {
      '--accent': selectedCategory.accent,
      '--accent-soft': selectedCategory.accentSoft,
    } as React.CSSProperties;
    return (
      <>
        <button className="help-chat-back" onClick={resetToHome}>
          <ChevronLeft size={16} />
          カテゴリ一覧へ戻る
        </button>
        <div className="help-chat-topic" style={styleVars}>
          <span className="help-chat-topic-badge" aria-hidden>
            <Icon size={20} />
          </span>
          <span>
            <strong>{selectedCategory.label}</strong>
            <small>{selectedCategory.description}</small>
          </span>
        </div>
        <div className="help-chat-list">
          {selectedCategory.questions.map((question) => (
            <button
              key={question.id}
              className="help-chat-question"
              onClick={() => setQuestionId(question.id)}
            >
              <span>{question.title}</span>
            </button>
          ))}
        </div>
      </>
    );
  };

  const renderAnswer = () => {
    if (!selectedCategory || !selectedQuestion) return null;
    const styleVars = {
      '--accent': selectedCategory.accent,
      '--accent-soft': selectedCategory.accentSoft,
    } as React.CSSProperties;
    return (
      <>
        <button className="help-chat-back" onClick={() => setQuestionId(null)}>
          <ChevronLeft size={16} />
          質問一覧へ戻る
        </button>
        <div className="help-chat-message help-chat-message--user">{selectedQuestion.title}</div>

        <div className="help-chat-answer" style={styleVars}>
          <p className="help-chat-answer-intro">{selectedQuestion.intro}</p>

          {selectedQuestion.steps && selectedQuestion.steps.length > 0 && (
            <div className="help-chat-steps">
              <div className="help-chat-steps-title">
                <ListChecks size={14} />
                手順
              </div>
              <ol>
                {selectedQuestion.steps.map((step, idx) => (
                  <li key={idx}>
                    <span className="help-chat-step-num">{idx + 1}</span>
                    <span className="help-chat-step-text">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {selectedQuestion.note && (
            <div className="help-chat-note">
              <CircleHelp size={14} />
              <span>{selectedQuestion.note}</span>
            </div>
          )}

          {selectedQuestion.link && (
            <button
              className="help-chat-link"
              onClick={() => goToLink(selectedQuestion.link!.href)}
            >
              <span>{selectedQuestion.link.label}</span>
              <ArrowRight size={15} />
            </button>
          )}
        </div>

        <div className="help-chat-contact">
          <div>
            <strong>解決しない場合</strong>
            <p>問い合わせ文を作成して、担当営業またはサポート窓口へ共有できます。</p>
          </div>
          <button
            className="help-chat-preview-toggle"
            onClick={() => setPreviewOpen((v) => !v)}
            aria-expanded={previewOpen}
          >
            {previewOpen ? '問い合わせ文を隠す' : '問い合わせ文をプレビュー'}
          </button>
          {previewOpen && (
            <pre className="help-chat-preview" aria-label="問い合わせ文プレビュー">
              {contactBody}
            </pre>
          )}
          <div className="help-chat-contact-actions">
            <button onClick={copyContactBody}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'コピー済み' : '問い合わせ内容をコピー'}
            </button>
            <button onClick={openMail}>
              <Send size={15} />
              メールで問い合わせ
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="help-chat-widget" aria-live="polite">
      {open && (
        <section className="help-chat-panel" aria-label="RISOTTOヘルプチャット">
          <header className="help-chat-header">
            <div>
              <span className="help-chat-kicker">
                <Bot size={15} />
                RISOTTO Help
              </span>
              <h2>操作ヘルプ</h2>
            </div>
            <button className="help-chat-close" onClick={() => setOpen(false)} aria-label="ヘルプを閉じる">
              <X size={18} />
            </button>
          </header>
          <div className="help-chat-body">
            {selectedQuestion ? renderAnswer() : selectedCategory ? renderCategory() : renderHome()}
          </div>
        </section>
      )}
      <button
        className="help-chat-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'ヘルプチャットを閉じる' : 'ヘルプチャットを開く'}
        title={open ? 'ヘルプを閉じる' : 'ヘルプ'}
      >
        {open ? <X size={22} /> : <MessageCircle size={23} />}
        {!open && <span><CircleHelp size={14} />ヘルプ</span>}
      </button>
    </div>
  );
};

export default HelpChatWidget;
