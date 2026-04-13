import React from 'react';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [30, 50, 100, 200];

const Pagination: React.FC<PaginationProps> = ({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  const buttonStyle = (disabled: boolean, active?: boolean): React.CSSProperties => ({
    padding: '0.375rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: active ? 'var(--color-primary, #3B82F6)' : '#fff',
    color: active ? '#fff' : disabled ? '#9ca3af' : '#374151',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '0.8125rem',
    minWidth: '2rem',
    textAlign: 'center',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        padding: '0.75rem 0',
        fontSize: '0.8125rem',
        color: '#6b7280',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>表示件数:</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          style={{
            padding: '0.25rem 0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.8125rem',
          }}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}件
            </option>
          ))}
        </select>
        <span>
          {total}件中 {startItem}-{endItem}件
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={buttonStyle(page <= 1)}
        >
          &lt;
        </button>
        {getPageNumbers().map((p, i) =>
          typeof p === 'string' ? (
            <span key={`ellipsis-${i}`} style={{ padding: '0 0.25rem' }}>
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              style={buttonStyle(false, p === page)}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={buttonStyle(page >= totalPages)}
        >
          &gt;
        </button>
      </div>
    </div>
  );
};

export default Pagination;
