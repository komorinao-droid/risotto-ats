import React from 'react';

export interface ColorDef {
  name: string;
  main: string;
  bg: string;
  border: string;
  dot: string;
}

export const COLORS: ColorDef[] = [
  { name: 'スカイブルー', main: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', dot: '#2563EB' },
  { name: 'グリーン', main: '#22C55E', bg: '#F0FDF4', border: '#BBF7D0', dot: '#16A34A' },
  { name: 'パープル', main: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', dot: '#7C3AED' },
  { name: 'イエロー', main: '#EAB308', bg: '#FEFCE8', border: '#FEF08A', dot: '#CA8A04' },
  { name: 'レッド', main: '#EF4444', bg: '#FEF2F2', border: '#FECACA', dot: '#DC2626' },
  { name: 'オレンジ', main: '#F97316', bg: '#FFF7ED', border: '#FED7AA', dot: '#EA580C' },
  { name: 'シアン', main: '#06B6D4', bg: '#ECFEFF', border: '#A5F3FC', dot: '#0891B2' },
  { name: 'ダークレッド', main: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5', dot: '#991B1B' },
  { name: 'ダークグリーン', main: '#15803D', bg: '#F0FDF4', border: '#86EFAC', dot: '#166534' },
  { name: 'ネイビー', main: '#1E3A8A', bg: '#EFF6FF', border: '#93C5FD', dot: '#1E40AF' },
  { name: 'バイオレット', main: '#7C3AED', bg: '#F5F3FF', border: '#C4B5FD', dot: '#6D28D9' },
  { name: 'ピンク', main: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', dot: '#DB2777' },
  { name: 'ティール', main: '#14B8A6', bg: '#F0FDFA', border: '#99F6E4', dot: '#0D9488' },
  { name: 'ライムグリーン', main: '#84CC16', bg: '#F7FEE7', border: '#BEF264', dot: '#65A30D' },
  { name: 'ブラウン', main: '#92400E', bg: '#FFFBEB', border: '#FCD34D', dot: '#78350F' },
  { name: 'スレート', main: '#64748B', bg: '#F8FAFC', border: '#CBD5E1', dot: '#475569' },
  { name: 'ローズ', main: '#F43F5E', bg: '#FFF1F2', border: '#FECDD3', dot: '#E11D48' },
  { name: 'アンバー', main: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: '#B45309' },
];

export function getColorDef(mainColor: string): ColorDef {
  return COLORS.find((c) => c.main === mainColor) || COLORS[0];
}

interface ColorPaletteProps {
  value: string;
  onChange: (color: string) => void;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({ value, onChange }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '0.5rem',
      }}
    >
      {COLORS.map((color) => (
        <button
          key={color.main}
          type="button"
          onClick={() => onChange(color.main)}
          title={color.name}
          style={{
            width: '2rem',
            height: '2rem',
            borderRadius: '50%',
            backgroundColor: color.main,
            border: value === color.main ? '3px solid #111827' : '2px solid transparent',
            cursor: 'pointer',
            outline: 'none',
            transition: 'transform 0.1s',
            transform: value === color.main ? 'scale(1.15)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  );
};

export default ColorPalette;
