import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
  style?: React.CSSProperties;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '選択してください',
  allLabel,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allOptions: Option[] = allLabel
    ? [{ value: '', label: allLabel }, ...options]
    : options;

  const filtered = allOptions.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel =
    allOptions.find((o) => o.value === value)?.label || placeholder;

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightIndex(-1);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightIndex]) {
        (items[highlightIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          onChange(filtered[highlightIndex].value);
          close();
        }
        break;
      case 'Escape':
        close();
        break;
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          backgroundColor: '#fff',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '0.875rem',
          color: value ? '#111827' : '#9ca3af',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel}
        </span>
        <span style={{ marginLeft: '0.5rem', color: '#9ca3af', fontSize: '0.7rem' }}>
          {isOpen ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 50,
            maxHeight: '240px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '0.5rem' }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="検索..."
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                fontSize: '0.8125rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <ul
            ref={listRef}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              overflowY: 'auto',
              maxHeight: '180px',
            }}
          >
            {filtered.length === 0 ? (
              <li
                style={{
                  padding: '0.5rem 0.75rem',
                  color: '#9ca3af',
                  fontSize: '0.8125rem',
                }}
              >
                該当なし
              </li>
            ) : (
              filtered.map((option, idx) => {
                const isHighlighted = idx === highlightIndex;
                const isSelected = option.value === value;

                // ハイライト表示: 検索文字列に一致する部分をboldに
                let labelElement: React.ReactNode = option.label;
                if (search) {
                  const lowerLabel = option.label.toLowerCase();
                  const lowerSearch = search.toLowerCase();
                  const matchIndex = lowerLabel.indexOf(lowerSearch);
                  if (matchIndex >= 0) {
                    const before = option.label.slice(0, matchIndex);
                    const match = option.label.slice(matchIndex, matchIndex + search.length);
                    const after = option.label.slice(matchIndex + search.length);
                    labelElement = (
                      <>
                        {before}
                        <strong style={{ color: 'var(--color-primary, #3B82F6)' }}>{match}</strong>
                        {after}
                      </>
                    );
                  }
                }

                return (
                  <li
                    key={option.value + idx}
                    onClick={() => {
                      onChange(option.value);
                      close();
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      backgroundColor: isHighlighted
                        ? '#eff6ff'
                        : isSelected
                          ? '#f0f9ff'
                          : 'transparent',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {labelElement}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
