import React, { useState, useEffect } from 'react';

/**
 * FormattedNumberInput — number input that displays comma-separated values (e.g. 1,500,000).
 *
 * Props:
 *   value     — numeric value (Number)
 *   onChange  — callback with (number)
 *   min       — minimum value (optional)
 *   max       — maximum value (optional)
 *   step      — step increment (optional, default 1)
 *   prefix    — optional prefix text (e.g. "฿")
 *   suffix    — optional suffix text (e.g. "ปี")
 *   className — extra CSS classes
 *   disabled  — disabled state
 *   placeholder — placeholder text
 */
export default function FormattedNumberInput({
  value = 0,
  onChange,
  min,
  max,
  step = 1,
  prefix = '',
  suffix = '',
  className = '',
  disabled = false,
  placeholder = ''
}) {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Sync display when external value changes
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatNumber(value));
    }
  }, [value, isFocused]);

  function formatNumber(num) {
    if (num === null || num === undefined || num === '') return '';
    const n = Number(num);
    if (isNaN(n)) return '';
    return n.toLocaleString('en-US');
  }

  function parseNumber(str) {
    const cleaned = str.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function handleFocus(e) {
    setIsFocused(true);
    // Show raw number on focus for easy editing
    setDisplayValue(value !== null && value !== undefined ? String(value) : '');
    e.target.select();
  }

  function handleBlur(e) {
    setIsFocused(false);
    const raw = parseNumber(e.target.value);
    let clamped = raw;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    setDisplayValue(formatNumber(clamped));
    if (onChange) onChange(clamped);
  }

  function handleChange(e) {
    const raw = e.target.value;
    // Allow only numbers, dots, commas, minus
    if (/^[0-9,.\-]*$/.test(raw) || raw === '') {
      setDisplayValue(raw);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  }

  const hasAffix = prefix || suffix;

  return (
    <div className={`relative inline-flex items-center w-full ${className}`}>
      {prefix && (
        <span className="absolute left-3 text-xs font-bold text-slate-400 pointer-events-none select-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white transition-colors ${
          prefix ? 'pl-7' : 'pl-3'
        } ${suffix ? 'pr-8' : 'pr-3'} py-2 ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
      />
      {suffix && (
        <span className="absolute right-3 text-xs font-bold text-slate-400 pointer-events-none select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
