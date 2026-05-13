import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleHelp,
  Copy,
  MessageCircle,
  Search,
  Send,
  Settings,
  Sparkles,
  Tags,
  UserPlus,
  X,
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

interface HelpQuestion {
  id: string;
  title: string;
  answer: string[];
}

interface HelpCategory {
  id: HelpCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
  questions: HelpQuestion[];
}

const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'applicants',
    label: '応募者の追加',
    description: '応募者登録、CSV取込、重複表示',
    icon: UserPlus,
    questions: [
      {
        id: 'add-single',
        title: '応募者を1人ずつ追加するには？',
        answer: [
          '左メニューの「応募者管理」を開き、「応募者追加」ボタンから登録します。',
          '氏名、電話番号、応募職種、応募媒体、拠点を入力すると一覧と進捗ボードに反映されます。',
          '同じ氏名または電話番号の応募者がいる場合は、重複として検知されます。',
        ],
      },
      {
        id: 'csv-import',
        title: 'CSVでまとめて取り込むには？',
        answer: [
          '応募者管理画面のCSV取込からファイルを選択します。',
          'ステータス列が空の場合は初期ステータスが入り、明示されたステータスは履歴として記録されます。',
          '取込前に列名と文字化けがないか確認してください。',
        ],
      },
      {
        id: 'duplicate',
        title: '重複応募はどこで確認できますか？',
        answer: [
          '応募者一覧と応募者詳細で、氏名・電話番号・メールなどをもとに重複候補が表示されます。',
          'CSV出力用の重複フラグも自動更新されます。',
          '完全に同一人物かどうかは、詳細画面で内容を確認して判断してください。',
        ],
      },
    ],
  },
  {
    id: 'statuses',
    label: 'ステータス管理',
    description: 'ステータス変更、履歴、対象外の扱い',
    icon: Tags,
    questions: [
      {
        id: 'status-change',
        title: '応募者のステータスを変更するには？',
        answer: [
          '応募者一覧や進捗ボードでは、行や応募者カードのステータス欄から直接変更できます。',
          '応募者詳細画面の上部からも変更でき、変更時に理由やメモを残せます。',
          '変更内容は履歴に記録され、後から経緯を確認できます。',
        ],
      },
      {
        id: 'status-history',
        title: 'ステータス変更履歴はどこで確認できますか？',
        answer: [
          '応募者詳細画面に変更履歴のセクションがあり、誰がいつどのステータスへ変えたかが時系列で並びます。',
          '採用レポートでもステップ別の通過数や所要日数として集計されます。',
        ],
      },
      {
        id: 'status-excluded',
        title: '対象外（辞退・不合格など）の扱いはどうなりますか？',
        answer: [
          '対象外系のステータスに変更すると、その応募者はアクティブな選考対象から外れます。',
          'カウントや進捗ボード上の表示も対象外として扱われますが、データは残るため後から検索・再開できます。',
          '誤って対象外にした場合は、ステータスを戻すことで再びアクティブに復帰します。',
        ],
      },
    ],
  },
  {
    id: 'interviews',
    label: '面接日程',
    description: '日程登録、面接方法・メモ、カレンダー',
    icon: CalendarDays,
    questions: [
      {
        id: 'interview-book',
        title: '面接日時を登録するには？',
        answer: [
          '応募者詳細、または面接カレンダーから日程を登録します。',
          '登録するとカレンダーに予定が作成され、応募者のステータスも面接確定へ更新されます。',
          '拠点や時間帯を確認してから登録してください。',
        ],
      },
      {
        id: 'interview-method-memo',
        title: '面接方法や面接メモはどこで管理しますか？',
        answer: [
          '面接予定の作成・編集時に、対面 / オンライン / 電話などの面接方法を選択できます。',
          '面接メモは応募者詳細の面接欄、または予定詳細から記録でき、次回面接や合否判断の参考にできます。',
          'キャンセルや変更があった場合の経緯も同じ場所に追記しておくと、後から振り返りやすくなります。',
        ],
      },
      {
        id: 'interview-calendar',
        title: 'カレンダーで日程や枠数を確認・調整するには？',
        answer: [
          '面接カレンダーから拠点を切り替えて、日別・時間帯別の予定や空き枠を確認できます。',
          '時間帯ごとの面接枠数も同画面で調整でき、一括設定で曜日や期間を指定してまとめて反映できます。',
          '予定の重複や空き枠の不足はカレンダー上で一覧できるため、登録前に確認するとミスを減らせます。',
        ],
      },
    ],
  },
  {
    id: 'reports',
    label: 'レポート',
    description: '採用レポート、媒体費、PDF/Excel',
    icon: BarChart3,
    questions: [
      {
        id: 'report-open',
        title: '採用レポートはどこから見られますか？',
        answer: [
          '左メニューの「設定」内、またはサイドバーの採用レポート導線から開けます。',
          '採用レポートオプションが有効な場合、ファネル分析、月次推移、媒体費用分析を確認できます。',
        ],
      },
      {
        id: 'cost-manage',
        title: '媒体費用はどこで入力しますか？',
        answer: [
          '採用レポート画面のコスト分析タブで、月別・媒体別の費用を入力します。',
          '入力した費用はCPAやCPHの計算に使われます。',
        ],
      },
      {
        id: 'export-report',
        title: 'レポートを出力できますか？',
        answer: [
          'CSV、Excel、印刷/PDF用の出力導線があります。',
          '提出用の資料にする場合は、対象期間と拠点・媒体の絞り込みを確認してから出力してください。',
        ],
      },
    ],
  },
  {
    id: 'screening',
    label: 'AIスクリーニング',
    description: '評価条件の考え方、NG条件、判定結果',
    icon: Sparkles,
    questions: [
      {
        id: 'screening-axes',
        title: 'AIスクリーニング条件はどう考えればよいですか？',
        answer: [
          '設定内の「AIスクリーニング」から、評価軸と重み、必須条件、望ましい条件を組み立てます。',
          '評価軸は「経験」「適性」「勤務条件」など複数を組み合わせ、職種ごとに優先順位を変えるのが基本です。',
          '最初から完璧に決めようとせず、運用しながら重みや条件を調整していくと精度が安定します。',
        ],
      },
      {
        id: 'screening-ng',
        title: 'NG条件（落としたい条件）はどう設定しますか？',
        answer: [
          'AIスクリーニング設定の「必須条件」や「除外条件」で、満たさない場合に不適合と判定したい項目を設定します。',
          '勤務地・年齢・経験などの除外要件は、ここで明確にしておくと判定がブレません。',
          '職種別に NG 条件を変えたい場合は、職種ごとの条件設定で個別に上書きできます。',
        ],
      },
      {
        id: 'screening-result',
        title: 'AI判定結果はどこで確認しますか？',
        answer: [
          '応募者詳細画面のAIスクリーニング欄に、スコアと評価軸ごとのコメントが表示されます。',
          '応募者一覧でもAI評価をソートや絞り込みに使えるため、優先確認したい応募者を素早く見つけられます。',
          'AI評価はあくまで判断材料の1つです。最終判断は必ず担当者が内容を確認してください。',
        ],
      },
    ],
  },
  {
    id: 'account',
    label: 'アカウント/拠点設定',
    description: '拠点、職種、権限、通知先',
    icon: Settings,
    questions: [
      {
        id: 'base-manage',
        title: '拠点を追加・編集するには？',
        answer: [
          '左メニューの「拠点管理」から追加・編集します。',
          '拠点を削除すると、関連する面接予定や拠点別設定も整理されます。',
          '削除前に対象応募者や予定の有無を確認してください。',
        ],
      },
      {
        id: 'child-account',
        title: '子アカウントの権限はどこで設定しますか？',
        answer: [
          '設定内の「アカウント」からメンバーを追加し、権限や通知設定を管理します。',
          '子アカウントは担当拠点を基準に表示範囲が制限されます。',
        ],
      },
      {
        id: 'job-source',
        title: '職種や応募媒体を管理するには？',
        answer: [
          '左メニューの「職種管理」「応募媒体管理」から設定します。',
          '拠点別に職種や媒体を分けたい場合は、拠点を選択して専用設定を作成します。',
        ],
      },
    ],
  },
];

function findCategory(id: HelpCategoryId | null): HelpCategory | undefined {
  return HELP_CATEGORIES.find((category) => category.id === id);
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

const HelpChatWidget: React.FC = () => {
  const { client } = useAuth();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<HelpCategoryId | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedCategory = findCategory(categoryId);
  const selectedQuestion = selectedCategory?.questions.find((question) => question.id === questionId);

  const searchResults = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    return HELP_CATEGORIES.flatMap((category) =>
      category.questions
        .filter((question) => {
          const target = normalize([category.label, question.title, ...question.answer].join(' '));
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

  const renderHome = () => (
    <>
      <div className="help-chat-message help-chat-message--bot">
        何についてお困りですか？カテゴリを選ぶか、キーワードで検索してください。
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
            return (
              <button
                key={category.id}
                className="help-chat-category"
                onClick={() => chooseCategory(category.id)}
              >
                <Icon size={18} />
                <span>
                  <strong>{category.label}</strong>
                  <small>{category.description}</small>
                </span>
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
    return (
      <>
        <button className="help-chat-back" onClick={resetToHome}>
          <ChevronLeft size={16} />
          カテゴリ一覧へ戻る
        </button>
        <div className="help-chat-topic">
          <Icon size={20} />
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
    return (
      <>
        <button className="help-chat-back" onClick={() => setQuestionId(null)}>
          <ChevronLeft size={16} />
          質問一覧へ戻る
        </button>
        <div className="help-chat-message help-chat-message--user">{selectedQuestion.title}</div>
        <div className="help-chat-message help-chat-message--bot">
          {selectedQuestion.answer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="help-chat-contact">
          <div>
            <strong>解決しない場合</strong>
            <p>問い合わせ文を作成して、担当営業またはサポート窓口へ共有できます。</p>
          </div>
          <div className="help-chat-contact-actions">
            <button onClick={copyContactBody}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'コピー済み' : '問い合わせ文をコピー'}
            </button>
            <button onClick={openMail}>
              <Send size={15} />
              メールを作成
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
