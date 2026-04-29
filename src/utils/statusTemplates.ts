/**
 * ステータステンプレート（業種別プリセット）
 *
 * 新規クライアント立ち上げ時や、既存クライアントの再設定時に使う。
 * 各テンプレートは category 設定済みなので、レポート集計に即反映される。
 */
import type { StatusCategory } from '@/types';

export interface StatusTemplateItem {
  name: string;
  category: StatusCategory;
  color: string;
  subStatuses?: string[];
}

export interface StatusTemplate {
  id: string;
  name: string;
  description: string;
  items: StatusTemplateItem[];
}

// よく使うカラー
const C = {
  blue:   '#3B82F6',
  cyan:   '#06B6D4',
  amber:  '#F59E0B',
  green:  '#10B981',
  emerald:'#059669',
  purple: '#8B5CF6',
  pink:   '#EC4899',
  red:    '#EF4444',
  gray:   '#6B7280',
  indigo: '#6366F1',
};

export const STATUS_TEMPLATES: StatusTemplate[] = [
  {
    id: 'standard',
    name: 'ATS標準（汎用）',
    description: '一般的な中途採用に最適。応募〜入社までの12ステータス。',
    items: [
      { name: '対応中',         category: 'screening', color: C.blue },
      { name: '書類選考中',     category: 'screening', color: C.cyan },
      { name: '不合格（書類）', category: 'ng',        color: C.gray },
      { name: '面接調整中',     category: 'interview', color: C.amber },
      { name: '面接確定',       category: 'interview', color: C.green, subStatuses: ['一次', '二次', '最終'] },
      { name: '不合格（面接前）', category: 'ng',      color: C.gray },
      { name: '面接合格',       category: 'hired',     color: C.emerald },
      { name: '内定',           category: 'offered',   color: C.purple },
      { name: '内定承諾',       category: 'hired',     color: C.indigo },
      { name: '入社',           category: 'active',    color: C.emerald },
      { name: '辞退',           category: 'ng',        color: C.gray },
      { name: '重複',           category: 'ng',        color: C.gray },
    ],
  },
  {
    id: 'sales-cs',
    name: '販売・軸接職',
    description: 'BtoC販売・カスタマーサクセス・コールセンター向け。研修フェーズ込み。',
    items: [
      { name: '応募',           category: 'screening', color: C.blue },
      { name: '書類選考中',     category: 'screening', color: C.cyan },
      { name: '書類不合格',     category: 'ng',        color: C.gray },
      { name: '面接調整中',     category: 'interview', color: C.amber },
      { name: '面接確定',       category: 'interview', color: C.green },
      { name: '面接不合格',     category: 'ng',        color: C.gray },
      { name: '面接合格',       category: 'hired',     color: C.emerald },
      { name: '内定',           category: 'offered',   color: C.purple },
      { name: '内定承諾',       category: 'hired',     color: C.indigo },
      { name: '研修中',         category: 'active',    color: C.green },
      { name: '稼働',           category: 'active',    color: C.emerald },
      { name: '辞退',           category: 'ng',        color: C.gray },
      { name: '連絡不通',       category: 'ng',        color: C.gray },
    ],
  },
  {
    id: 'manufacturing',
    name: '製造・オペレーター',
    description: '工場見学・派遣を伴う製造業向け。シンプルなフロー。',
    items: [
      { name: '応募',           category: 'screening', color: C.blue },
      { name: '工場見学調整中', category: 'interview', color: C.amber },
      { name: '工場見学確定',   category: 'interview', color: C.green },
      { name: '採用',           category: 'hired',     color: C.emerald },
      { name: '入社',           category: 'active',    color: C.green },
      { name: '稼働',           category: 'active',    color: C.emerald },
      { name: '不合格',         category: 'ng',        color: C.gray },
      { name: '辞退',           category: 'ng',        color: C.gray },
      { name: '対象外',         category: 'ng',        color: C.gray },
    ],
  },
  {
    id: 'food-service',
    name: '飲食・サービス業',
    description: '体験入店・店舗面接など飲食業界向け。',
    items: [
      { name: '応募',           category: 'screening', color: C.blue },
      { name: '面接調整中',     category: 'interview', color: C.amber },
      { name: '面接実施済',     category: 'interview', color: C.green },
      { name: '採用',           category: 'hired',     color: C.emerald },
      { name: '体験入店',       category: 'active',    color: C.green },
      { name: '入社',           category: 'active',    color: C.emerald },
      { name: '不合格',         category: 'ng',        color: C.gray },
      { name: '辞退',           category: 'ng',        color: C.gray },
      { name: '連絡不通',       category: 'ng',        color: C.gray },
    ],
  },
  {
    id: 'engineer',
    name: 'エンジニア・専門職',
    description: 'カジュアル面談・技術面接を含む専門職向け。',
    items: [
      { name: '応募',             category: 'screening', color: C.blue },
      { name: '書類選考中',       category: 'screening', color: C.cyan },
      { name: 'カジュアル面談',   category: 'interview', color: C.amber },
      { name: '一次面接',         category: 'interview', color: C.amber, subStatuses: ['調整中', '確定'] },
      { name: '技術面接',         category: 'interview', color: C.green, subStatuses: ['調整中', '確定'] },
      { name: '最終面接',         category: 'interview', color: C.green, subStatuses: ['調整中', '確定'] },
      { name: 'オファー面談',     category: 'offered',   color: C.purple },
      { name: '内定',             category: 'offered',   color: C.purple },
      { name: '内定承諾',         category: 'hired',     color: C.indigo },
      { name: '入社',             category: 'active',    color: C.emerald },
      { name: '書類不合格',       category: 'ng',        color: C.gray },
      { name: '面接不合格',       category: 'ng',        color: C.gray },
      { name: '辞退',             category: 'ng',        color: C.gray },
    ],
  },
];

export function getTemplateById(id: string): StatusTemplate | undefined {
  return STATUS_TEMPLATES.find((t) => t.id === id);
}
