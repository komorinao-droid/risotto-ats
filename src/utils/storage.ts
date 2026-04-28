import type {
  ClientData,
  Client,
  Status,
  EmailTemplate,
  PrefDateTime,
} from '@/types';

/** prefDates を旧フォーマット（string[]）から新フォーマット（PrefDateTime[]）へ移行 */
function migratePrefDates(data: ClientData): ClientData {
  const needsMigration = data.applicants?.some(a =>
    Array.isArray(a.prefDates) && a.prefDates.length > 0 && typeof a.prefDates[0] === 'string'
  );
  if (!needsMigration) return data;
  return {
    ...data,
    applicants: data.applicants.map(a => ({
      ...a,
      prefDates: (a.prefDates as unknown as (PrefDateTime | string)[]).map(d =>
        typeof d === 'string' ? { date: d, time: '' } : d
      ),
    })),
  };
}

const CLIENTS_KEY = 'hireflow:clients';

function clientDataKey(clientId: string): string {
  return `hireflow:client:${clientId}:data`;
}

function getDefaultStatuses(): Status[] {
  return [
    { id: 1, name: '対応中', color: '#3B82F6', active: true, order: 1, subStatuses: [] },
    { id: 2, name: '書類選考中', color: '#8B5CF6', active: true, order: 2, subStatuses: [] },
    { id: 3, name: '面接調整中', color: '#F59E0B', active: true, order: 3, subStatuses: [] },
    { id: 4, name: '面接確定', color: '#10B981', active: true, order: 4, subStatuses: [] },
    { id: 5, name: '面接合格', color: '#06B6D4', active: true, order: 5, subStatuses: [] },
    { id: 6, name: '内定', color: '#EC4899', active: true, order: 6, subStatuses: [] },
    { id: 7, name: '入社', color: '#22C55E', active: true, order: 7, subStatuses: [] },
    { id: 8, name: '内定【承諾】', color: '#14B8A6', active: true, order: 8, subStatuses: [] },
    { id: 9, name: '辞退', color: '#6B7280', active: false, order: 9, subStatuses: [] },
    { id: 10, name: '不合格（面接前）', color: '#EF4444', active: false, order: 10, subStatuses: [] },
    { id: 11, name: '不合格（面接後）', color: '#DC2626', active: false, order: 11, subStatuses: [] },
    { id: 12, name: '不合格（人柄）', color: '#B91C1C', active: false, order: 12, subStatuses: [] },
    {
      id: 13,
      name: '条件不一致',
      color: '#F97316',
      active: false,
      order: 13,
      subStatuses: ['給与', '勤務地', '勤務時間', '雇用形態', '業務内容'],
    },
    { id: 14, name: '対象外', color: '#9CA3AF', active: false, order: 14, subStatuses: [] },
    { id: 15, name: '重複', color: '#D1D5DB', active: false, order: 15, subStatuses: [] },
    { id: 16, name: '連絡不通', color: '#78716C', active: false, order: 16, subStatuses: [] },
    { id: 17, name: '一次面接調整中', color: '#A855F7', active: false, order: 17, subStatuses: [] },
  ];
}

function getDefaultEmailTemplates(): EmailTemplate[] {
  return [
    {
      id: 1,
      name: '面接日程調整',
      subject: '【{{拠点}}】面接日程のご案内',
      body: `{{氏名}} 様

この度は{{職種}}へのご応募ありがとうございます。
書類を拝見し、ぜひ面接にお越しいただきたくご連絡いたしました。

下記の日程よりご都合の良い日時をお知らせください。

ご不明な点がございましたら、お気軽にお問い合わせください。
何卒よろしくお願いいたします。`,
    },
    {
      id: 2,
      name: '書類選考通過',
      subject: '【選考結果】書類選考通過のお知らせ',
      body: `{{氏名}} 様

この度は{{職種}}へのご応募ありがとうございます。
厳正な書類選考の結果、ぜひ次の選考ステップにお進みいただきたくご連絡いたしました。

今後の選考スケジュールについて、追ってご案内いたします。
何卒よろしくお願いいたします。`,
    },
    {
      id: 3,
      name: '選考結果（不採用）',
      subject: '【選考結果のご連絡】',
      body: `{{氏名}} 様

この度は{{職種}}へのご応募ありがとうございました。
慎重に選考を進めさせていただきましたが、誠に残念ながら今回はご期待に沿えない結果となりました。

{{氏名}}様の今後のご活躍を心よりお祈り申し上げます。`,
    },
  ];
}

// getDefaultFilterCondition is used inside getDemoData inline

function getDemoData(): ClientData {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  const daysLater = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

  const bases = [
    { id: 1, name: '東京本社', nameKana: 'トウキョウホンシャ', address: '東京都千代田区丸の内1-1-1', phone: '03-1234-5678', matchingCondition: '関東エリア希望者', notes: '', registeredDate: '2025-04-01', color: '#3B82F6', slotInterval: 30, startTime: '09:00', endTime: '18:00' },
    { id: 2, name: '大阪支社', nameKana: 'オオサカシシャ', address: '大阪府大阪市北区梅田2-2-2', phone: '06-2345-6789', matchingCondition: '関西エリア希望者', notes: '', registeredDate: '2025-04-01', color: '#10B981', slotInterval: 30, startTime: '09:00', endTime: '18:00' },
    { id: 3, name: '名古屋支社', nameKana: 'ナゴヤシシャ', address: '愛知県名古屋市中村区名駅3-3-3', phone: '052-3456-7890', matchingCondition: '東海エリア希望者', notes: '', registeredDate: '2025-06-15', color: '#F59E0B', slotInterval: 60, startTime: '10:00', endTime: '17:00' },
    { id: 4, name: '福岡支社', nameKana: 'フクオカシシャ', address: '福岡県福岡市博多区博多駅前4-4-4', phone: '092-4567-8901', matchingCondition: '九州エリア希望者', notes: '', registeredDate: '2025-08-01', color: '#8B5CF6', slotInterval: 30, startTime: '09:00', endTime: '18:00' },
  ];

  const jobs = [
    { id: 1, name: '営業職', color: '#3B82F6' },
    { id: 2, name: 'エンジニア', color: '#10B981' },
    { id: 3, name: '事務職', color: '#F59E0B' },
    { id: 4, name: 'デザイナー', color: '#EC4899' },
    { id: 5, name: 'カスタマーサポート', color: '#06B6D4' },
    { id: 6, name: 'マーケティング', color: '#8B5CF6' },
  ];

  const sources = [
    { id: 1, name: 'Indeed', color: '#3B82F6', monthlyCost: 50000, loginId: 'risotto_indeed', password: 'pass1234', url: 'https://indeed.com' },
    { id: 2, name: 'リクナビNEXT', color: '#EF4444', monthlyCost: 80000, loginId: 'risotto_rn', password: 'pass5678', url: 'https://next.rikunabi.com' },
    { id: 3, name: 'マイナビ転職', color: '#22C55E', monthlyCost: 120000, loginId: 'risotto_mn', password: 'pass9012', url: 'https://tenshoku.mynavi.jp' },
    { id: 4, name: 'doda', color: '#F97316', monthlyCost: 100000, loginId: 'risotto_doda', password: 'pass3456', url: 'https://doda.jp' },
    { id: 5, name: 'エン転職', color: '#A855F7', monthlyCost: 60000, loginId: 'risotto_en', password: 'pass7890', url: 'https://employment.en-japan.com' },
    { id: 6, name: '自社HP', color: '#14B8A6', monthlyCost: 0, loginId: '', password: '', url: 'https://risotto.co.jp/recruit' },
    { id: 7, name: '紹介', color: '#6366F1', monthlyCost: 0, loginId: '', password: '', url: '' },
  ];

  const names = [
    { name: '田中 太郎', furigana: 'タナカ タロウ', gender: '男性', birth: '1990-05-15', age: 35 },
    { name: '佐藤 花子', furigana: 'サトウ ハナコ', gender: '女性', birth: '1995-08-22', age: 30 },
    { name: '鈴木 一郎', furigana: 'スズキ イチロウ', gender: '男性', birth: '1988-03-10', age: 38 },
    { name: '高橋 美咲', furigana: 'タカハシ ミサキ', gender: '女性', birth: '1992-11-03', age: 33 },
    { name: '伊藤 健太', furigana: 'イトウ ケンタ', gender: '男性', birth: '1997-01-28', age: 29 },
    { name: '渡辺 愛', furigana: 'ワタナベ アイ', gender: '女性', birth: '1993-07-14', age: 32 },
    { name: '山本 大輔', furigana: 'ヤマモト ダイスケ', gender: '男性', birth: '1985-12-01', age: 40 },
    { name: '中村 さくら', furigana: 'ナカムラ サクラ', gender: '女性', birth: '1998-04-20', age: 28 },
    { name: '小林 翔', furigana: 'コバヤシ ショウ', gender: '男性', birth: '1991-09-08', age: 34 },
    { name: '加藤 由美', furigana: 'カトウ ユミ', gender: '女性', birth: '1994-06-30', age: 31 },
    { name: '吉田 拓海', furigana: 'ヨシダ タクミ', gender: '男性', birth: '1996-02-14', age: 30 },
    { name: '山田 恵子', furigana: 'ヤマダ ケイコ', gender: '女性', birth: '1989-10-25', age: 36 },
    { name: '松本 直樹', furigana: 'マツモト ナオキ', gender: '男性', birth: '1987-08-05', age: 38 },
    { name: '井上 真理', furigana: 'イノウエ マリ', gender: '女性', birth: '1999-03-17', age: 27 },
    { name: '木村 悠太', furigana: 'キムラ ユウタ', gender: '男性', birth: '1993-12-09', age: 32 },
    { name: '林 麻衣', furigana: 'ハヤシ マイ', gender: '女性', birth: '1996-05-22', age: 29 },
    { name: '清水 剛', furigana: 'シミズ タケシ', gender: '男性', birth: '1984-01-11', age: 42 },
    { name: '森 優子', furigana: 'モリ ユウコ', gender: '女性', birth: '1991-07-03', age: 34 },
    { name: '阿部 龍一', furigana: 'アベ リュウイチ', gender: '男性', birth: '1995-11-18', age: 30 },
    { name: '石川 あかり', furigana: 'イシカワ アカリ', gender: '女性', birth: '1997-09-27', age: 28 },
    { name: '前田 智也', furigana: 'マエダ トモヤ', gender: '男性', birth: '1990-04-06', age: 36 },
    { name: '藤田 彩花', furigana: 'フジタ アヤカ', gender: '女性', birth: '1994-08-14', age: 31 },
    { name: '岡田 修平', furigana: 'オカダ シュウヘイ', gender: '男性', birth: '1986-06-20', age: 39 },
    { name: '後藤 美穂', furigana: 'ゴトウ ミホ', gender: '女性', birth: '1998-02-08', age: 28 },
    { name: '長谷川 亮', furigana: 'ハセガワ リョウ', gender: '男性', birth: '1992-10-30', age: 33 },
  ];

  const statusNames = ['対応中', '書類選考中', '面接調整中', '面接確定', '面接合格', '内定', '入社', '内定【承諾】', '辞退', '不合格（面接前）'];
  const currentJobs = ['営業', 'SE', '事務', 'デザイナー', '接客', 'マーケター', '企画', '総務', '経理', '無職'];
  const phones = ['09012345678', '08098765432', '07011112222', '09033334444', '08055556666', '07077778888', '09099990000', '08011223344', '09055667788', '07099887766'];

  const applicants = names.map((n, i) => {
    const applyDate = daysAgo(Math.floor(Math.random() * 60));
    const baseIdx = i % bases.length;
    const jobIdx = i % jobs.length;
    const srcIdx = i % sources.length;
    const stIdx = i < 8 ? i : i < 15 ? Math.floor(Math.random() * 8) : (8 + Math.floor(Math.random() * 2));
    return {
      id: 1000 + i,
      name: n.name,
      furigana: n.furigana,
      email: `${n.furigana.split(' ')[0].toLowerCase()}${i}@example.com`,
      phone: phones[i % phones.length],
      gender: n.gender,
      age: n.age,
      birthDate: n.birth,
      currentJob: currentJobs[i % currentJobs.length],
      date: fmt(applyDate),
      job: jobs[jobIdx].name,
      src: sources[srcIdx].name,
      stage: statusNames[stIdx],
      subStatus: '',
      base: bases[baseIdx].name,
      note: i < 10 ? `ヒアリング済み。${['前職での実績あり', '意欲的な候補者', '即日勤務可能', 'リモート希望', '経験豊富', '新卒', '第二新卒', '管理職経験あり', '英語力あり', 'スキルマッチ'][i]}。` : '',
      needsAction: i % 5 === 0,
      actionDate: i % 5 === 0 ? fmt(daysLater(1 + (i % 3))) : '',
      actionTime: i % 5 === 0 ? `${10 + (i % 8)}:00` : '',
      actionMemo: i % 5 === 0 ? ['電話連絡する', '書類確認', '面接日程の再調整', '条件提示の準備', '内定通知を送付'][Math.floor(i / 5) % 5] : '',
      prefDates: i < 5 ? [
        { date: fmt(daysLater(3)), time: '10:00' },
        { date: fmt(daysLater(5)), time: '14:00' },
        { date: fmt(daysLater(7)), time: '' },
      ] : [],
      intResult: i === 4 ? '合格' : i === 9 ? '不合格' : i === 14 ? '欠席' : '',
      intMethod: i < 12 ? (i % 2 === 0 ? '対面' : 'WEB') : '',
      active: stIdx < 8,
      duplicate: i === 2 || i === 15,
      files: i < 3 ? [{ name: `履歴書_${n.name.replace(' ', '')}.pdf`, size: 245000 + i * 10000, url: '#' }] : [],
      jobInfo: { jobId: `W${String(1000000 + i * 13579).slice(0, 9)}`, jobNumber: i < 10 ? `J00${i + 1}` : `J0${i + 1}`, productName: '', jobName: `${bases[baseIdx].name}[JO0${(i % 9) + 1}]_${jobs[jobIdx].name}_${25120 + i}`, publishedJobType: jobs[jobIdx].name, companyName: bases[baseIdx].name },
      chatAnswers: [],
    };
  });

  // 面接イベント（面接確定・面接合格の応募者にイベント作成）
  const events = applicants
    .filter(a => ['面接確定', '面接合格', '内定', '内定【承諾】', '入社'].includes(a.stage))
    .map((a, i) => ({
      id: 2000 + i,
      applicantId: a.id,
      date: fmt(daysLater(i - 2)),
      start: `${10 + (i % 7)}:00`,
      end: `${11 + (i % 7)}:00`,
      title: `${a.name} - ${a.job}面接`,
      color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][i % 6],
      base: a.base,
      method: i % 2 === 0 ? '対面' : 'WEB',
    }));

  // 面接枠設定
  const slotSettings: Record<string, Record<string, Record<string, number>>> = {};
  bases.forEach(b => {
    slotSettings[b.name] = {};
    for (let d = -2; d <= 12; d++) {
      const dt = daysLater(d);
      if (dt.getDay() === 0 || dt.getDay() === 6) continue;
      const dateStr = fmt(dt);
      slotSettings[b.name][dateStr] = {};
      const slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
      slots.forEach(s => { slotSettings[b.name][dateStr][s] = b.name === '東京本社' ? 3 : 2; });
    }
  });

  const hearingTemplates = jobs.map(j => ({
    jobName: j.name,
    template: `【${j.name} ヒアリングシート】\n\n■ 志望動機:\n\n■ 前職での経験:\n\n■ 希望年収:\n\n■ 勤務開始可能日:\n\n■ 通勤方法:\n\n■ その他特記事項:\n`,
  }));

  const exclusionList = [
    { id: 1, type: 'email' as const, email: 'spam@example.com' },
    { id: 2, type: 'phone' as const, phone: '00000000000' },
    { id: 3, type: 'name_birth' as const, name: 'テスト 太郎', birthDate: '2000-01-01' },
  ];

  const chatScenarios = [
    {
      id: 1, name: '初回応募フロー',
      messages: [
        { id: 1, text: 'ご応募ありがとうございます。まずはご希望の職種を教えてください。', buttons: [
          { label: '営業職', nextScenarioId: 2 },
          { label: 'エンジニア', nextScenarioId: 2 },
          { label: 'その他', nextScenarioId: 2 },
        ]},
      ],
    },
    {
      id: 2, name: '日程調整フロー',
      messages: [
        { id: 2, text: '面接のご希望日時を教えてください。', buttons: [
          { label: '今週中', nextScenarioId: undefined },
          { label: '来週以降', nextScenarioId: undefined },
        ]},
      ],
    },
  ];

  const chatQuestionGroups = [
    {
      id: 1, name: '基本質問',
      questions: [
        { id: 1, text: '現在の就業状況を教えてください。' },
        { id: 2, text: '転職理由を教えてください。' },
        { id: 3, text: '希望の勤務地はありますか？' },
      ],
    },
    {
      id: 2, name: 'スキル確認',
      questions: [
        { id: 4, text: '得意な業務やスキルを教えてください。' },
        { id: 5, text: '保有している資格はありますか？' },
      ],
    },
  ];

  return {
    applicants,
    events,
    statuses: getDefaultStatuses(),
    sources,
    bases,
    jobs,
    emailTemplates: getDefaultEmailTemplates(),
    exclusionList,
    filterCondition: {
      ageEnabled: true,
      ageMin: 18,
      ageMax: 55,
      genderFilter: [],
      sourceFilter: [],
      jobFilter: jobs.map(j => j.name),
      excludeStatus: '対象外',
      flagAges: [18, 19, 50, 55],
    },
    hearingTemplates,
    slotSettings,
    chatScenarios,
    chatQuestionGroups,
    chatLeadSettings: [
      {
        id: 1,
        baseName: '大阪支社',
        leadName: '警備スタッフ応募フロー',
        startMessage: 'この度はご応募いただきありがとうございます。\n簡単な質問と面接のご案内を進めさせていただきますので、下記の案内に沿ってご入力をお願いします。',
        questions: [
          {
            id: 1,
            content: 'ご希望の「週の勤務日数」を選択してください。',
            answerType: 'single' as const,
            choices: [
              { id: 1, label: '週2日程度', judgment: 'ok' as const, action: 'next' as const },
              { id: 2, label: '週3日程度', judgment: 'ok' as const, action: 'next' as const },
              { id: 3, label: '週4日程度', judgment: 'ok' as const, action: 'next' as const },
              { id: 4, label: '週5日程度', judgment: 'ok' as const, action: 'next' as const },
            ],
          },
          {
            id: 2,
            content: '土日の勤務に関して、勤務可能な曜日を選択してください。',
            answerType: 'multiple' as const,
            choices: [
              { id: 1, label: '土曜', judgment: 'ok' as const, action: 'next' as const },
              { id: 2, label: '日曜', judgment: 'ok' as const, action: 'next' as const },
              { id: 3, label: '土日どちらも可能', judgment: 'ok' as const, action: 'next' as const },
              { id: 4, label: '土日どちらも不可', judgment: 'ng' as const, action: 'ng_immediate' as const },
            ],
          },
          {
            id: 3,
            content: 'いままでの警備・設備等の仕事経験を教えてください。\n該当するものを全て選択してください。',
            answerType: 'multiple' as const,
            choices: [
              { id: 1, label: '警備経験3年未満', judgment: 'ok' as const, action: 'next' as const },
              { id: 2, label: '施設警備3年以上', judgment: 'ok' as const, action: 'next' as const },
              { id: 3, label: '設備員経験3年以上', judgment: 'ok' as const, action: 'next' as const },
              { id: 4, label: '自火報盤・中央監視盤を扱う', judgment: 'ok' as const, action: 'next' as const },
              { id: 5, label: '特になし', judgment: 'ok' as const, action: 'next' as const },
            ],
          },
        ],
        ngMessageImmediate: '大変申し訳ございませんが、ご希望の条件では採用が難しい状況です。またの機会にご応募いただければ幸いです。',
        ngMessageAfterAll: '選考の結果、今回はご希望に沿えませんでした。何卒ご了承ください。',
        interviewCalendars: [
          {
            id: 1,
            baseName: '大阪支社',
            methods: ['対面', 'WEB'],
            preDateMessage: '面接希望日程（第1〜第3）を入力してください。\n※第1・第2希望は必須\n※日付と面接可能時間帯の順でご入力ください。',
            chatEndMessage: 'ご入力ありがとうございました。',
            confirmedMessage: 'ご希望の日程から面接日を調整し、確定後に再度ご連絡します。',
            methodDecidedMessage: '入力ありがとうございます。次に面接時間の調整をします。',
          },
        ],
      },
    ],
  };
}

export function getDefaultClientData(): ClientData {
  return getDemoData();
}

class StorageService {
  getClientData(clientId: string): ClientData {
    try {
      const raw = localStorage.getItem(clientDataKey(clientId));
      if (raw) {
        const parsed = JSON.parse(raw) as ClientData;
        const migrated = migratePrefDates(parsed);
        // マイグレーションが発生した場合は保存し直す
        if (migrated !== parsed) {
          this.saveClientData(clientId, migrated);
        }
        return migrated;
      }
    } catch {
      // 破損データはデフォルトで上書き
    }
    const defaultData = getDefaultClientData();
    this.saveClientData(clientId, defaultData);
    return defaultData;
  }

  saveClientData(clientId: string, data: ClientData): void {
    try {
      localStorage.setItem(clientDataKey(clientId), JSON.stringify(data));
    } catch (e: any) {
      const msg = e?.name === 'QuotaExceededError' || (e?.message || '').toLowerCase().includes('quota')
        ? 'ストレージ容量の上限に達しました。古い添付ファイル等を削除してから再度お試しください。'
        : `データ保存に失敗しました: ${e?.message || e}`;
      // ユーザーに通知
      try { window.alert(msg); } catch { /* ignore */ }
      throw e;
    }
  }

  getClients(): Client[] {
    try {
      const raw = localStorage.getItem(CLIENTS_KEY);
      if (raw) {
        return JSON.parse(raw) as Client[];
      }
    } catch {
      // 破損データは空配列で上書き
    }
    return [];
  }

  saveClients(clients: Client[]): void {
    try {
      localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
    } catch (e: any) {
      const msg = e?.name === 'QuotaExceededError' || (e?.message || '').toLowerCase().includes('quota')
        ? 'ストレージ容量の上限に達しました。'
        : `クライアント情報の保存に失敗しました: ${e?.message || e}`;
      try { window.alert(msg); } catch { /* ignore */ }
      throw e;
    }
  }
}

export const storage = new StorageService();
