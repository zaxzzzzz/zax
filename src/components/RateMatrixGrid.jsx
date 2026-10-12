import React, { useState } from 'react';
import {
  Table2,
  Plus,
  Trash2,
  Check,
  X,
  ShieldCheck,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import {
  normalizeRateMatrix,
  normalizeRateMatrixRow,
  emptyMatrixRow,
  computeAvg3yr,
  RATE_MATRIX_CUSTOMER_GROUPS
} from '../types/rateMatrix';

/** Canonical Thai property types (must mirror refinancePromotionService). */
const PROPERTY_TYPES = ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด', 'อาคารพาณิชย์', 'ที่ดินพร้อมสิ่งปลูกสร้าง'];

/**
 * One editable cell: renders as text; click → becomes an inline input.
 * Enter / blur commits, Escape cancels. Numeric cells show unit suffix.
 */
function EditableCell({ value, onChange, type = 'text', options = null, numeric = false, suffix = '', className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const display = value === null || value === undefined || value === ''
    ? (numeric ? '0' : '—')
    : String(value);

  const commit = () => {
    setEditing(false);
    if (type === 'number') {
      const n = Number(String(draft).replace(/[^\d.-]/g, ''));
      onChange(Number.isFinite(n) ? n : 0);
    } else if (type === 'array') {
      onChange(String(draft).split(/[,\n]/).map(s => s.trim()).filter(Boolean));
    } else {
      onChange(String(draft).trim());
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing && type === 'select') {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => { onChange(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="w-full text-[11px] py-1 px-1.5 rounded-md border-2 border-indigo-500 bg-white font-bold text-indigo-700 outline-none"
      >
        {(options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type === 'number' ? 'number' : 'text'}
        step={numeric ? '0.01' : undefined}
        value={draft ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        className={`w-full text-[11px] py-1 px-1.5 rounded-md border-2 border-indigo-500 bg-white outline-none ${className}`}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title="คลิกเพื่อแก้ไข"
      onClick={() => { setDraft(value); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setDraft(value); setEditing(true); } }}
      className={`min-h-[26px] px-1.5 py-1 rounded-md text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:ring-2 hover:ring-indigo-300 cursor-text transition-all ${className}`}
    >
      {display}{suffix && display !== '—' ? <span className="text-slate-400">{suffix}</span> : null}
    </div>
  );
}

/** Small toggle chip for boolean cells (MRTA / free mortgage fee). */
function BoolChip({ value, onChange, trueLabel, falseLabel, trueClass, falseClass }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      title="คลิกเพื่อสลับค่า"
      className={`w-full text-[10px] font-black px-1.5 py-1 rounded-md border-2 transition-all cursor-pointer ${value ? trueClass : falseClass}`}
    >
      {value ? trueLabel : falseLabel}
    </button>
  );
}

/**
 * RateMatrixGrid — spreadsheet-like editable grid for one promotion's
 * rate_matrix. Every cell is click-to-edit so the admin can cross-check the
 * AI extraction against the banner image cell-by-cell before saving.
 *
 * Columns (per requirements): รายได้ขั้นต่ำ (Min Income), เงื่อนไข MRTA,
 * เงื่อนไขจดจำนอง (Mortgage Fee), ปีที่ 1, ปีที่ 2-3, เฉลี่ย 3 ปี (Avg 3 Yr).
 *
 * @param {{
 *   matrix: Array,
 *   onChange: (rows: Array) => void,
 *   highlight?: boolean,
 *   compact?: boolean,
 *   title?: string
 * }} props
 */
export default function RateMatrixGrid({
  matrix,
  onChange,
  highlight = false,
  compact = false,
  title = 'ตารางเงื่อนไขดอกเบี้ยรายแถว (Rate Matrix)'
}) {
  const rows = normalizeRateMatrix(matrix);
  if (rows.length === 0 && !onChange) return null;

  /** Update one row field and recompute the derived avg. */
  const updateRow = (index, field, value) => {
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      const updated = normalizeRateMatrixRow({ ...r, [field]: value }, i);
      if (['year_1_rate', 'year_2_3_rate', 'avg_3yr_rate'].includes(field)) {
        // Recompute avg from rates unless the admin just typed an explicit avg
        if (field !== 'avg_3yr_rate') {
          updated.avg_3yr_rate = computeAvg3yr(updated);
        }
      }
      return updated;
    });
    onChange(next);
  };

  const addRow = () => onChange([...rows, emptyMatrixRow(rows.length + 1)]);
  const removeRow = (idx) => onChange(rows.filter((_, i) => i !== idx));

  const hasMRTASplit = rows.some(r => r.is_mrta) && rows.some(r => !r.is_mrta);

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${highlight ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-black text-slate-800">{title}</span>
          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full">
            {rows.length} แถว
          </span>
          {hasMRTASplit && (
            <span className="text-[10px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
              MRTA + ไม่ MRTA
            </span>
          )}
        </div>
        {onChange && (
          <button
            type="button"
            onClick={addRow}
            className="text-[10px] font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" /> เพิ่มแถว
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
              <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">#</th>
              <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">กลุ่มลูกค้า</th>
              <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">รายได้ขั้นต่ำ</th>
              {!compact && <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">ประเภทหลักประกัน</th>}
              <th className="px-2 py-1.5 text-center font-black whitespace-nowrap">เงื่อนไข MRTA</th>
              <th className="px-2 py-1.5 text-center font-black whitespace-nowrap">เงื่อนไขจดจำนอง</th>
              <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">ปีที่ 1</th>
              <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">ปีที่ 2-3</th>
              <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">เฉลี่ย 3 ปี</th>
              {!compact && <th className="px-2 py-1.5 text-left font-black whitespace-nowrap">EIR</th>}
              {onChange && <th className="px-2 py-1.5 text-center font-black"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-center text-slate-400 font-semibold">
                  <div className="flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ยังไม่มีข้อมูลตาราง — กด "เพิ่มแถว" เพื่อเพิ่มเงื่อนไขเอง หรือวิเคราะห์รูปด้วย AI ก่อน
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="px-2 py-1 font-black text-slate-400">{idx + 1}</td>
                  <td className="px-1 py-1">
                    {onChange ? (
                      <EditableCell
                        value={row.customer_group}
                        type="select"
                        options={RATE_MATRIX_CUSTOMER_GROUPS}
                        onChange={(v) => updateRow(idx, 'customer_group', v)}
                      />
                    ) : (
                      <span className="text-slate-700 font-semibold">{row.customer_group}</span>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    {onChange ? (
                      <EditableCell
                        value={row.min_income}
                        type="number"
                        numeric
                        suffix=" ฿"
                        onChange={(v) => updateRow(idx, 'min_income', v)}
                      />
                    ) : (
                      <span className="font-bold text-slate-800">{row.min_income > 0 ? `${row.min_income.toLocaleString()} ฿` : 'ไม่กำหนด'}</span>
                    )}
                  </td>
                  {!compact && (
                    <td className="px-1 py-1 max-w-[140px]">
                      {onChange ? (
                        <EditableCell
                          value={(row.property_types || []).join(', ')}
                          onChange={(v) => updateRow(idx, 'property_types', v)}
                          className="italic"
                        />
                      ) : (
                        <span className="text-slate-600">{(row.property_types || []).length > 0 ? row.property_types.join(', ') : 'ทุกประเภท'}</span>
                      )}
                    </td>
                  )}
                  <td className="px-1 py-1 text-center">
                    {onChange ? (
                      <BoolChip
                        value={row.is_mrta}
                        onChange={(v) => updateRow(idx, 'is_mrta', v)}
                        trueLabel="🛡️ ทำ MRTA"
                        falseLabel="ไม่ทำ"
                        trueClass="bg-purple-600 text-white border-purple-600"
                        falseClass="bg-white text-slate-500 border-slate-200"
                      />
                    ) : (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${row.is_mrta ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {row.is_mrta ? 'ทำ MRTA' : 'ไม่ทำ'}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-1 text-center">
                    {onChange ? (
                      <BoolChip
                        value={row.is_free_mortgage}
                        onChange={(v) => updateRow(idx, 'is_free_mortgage', v)}
                        trueLabel="ฟรีค่าจดจำนอง"
                        falseLabel="ไม่ฟรี"
                        trueClass="bg-emerald-600 text-white border-emerald-600"
                        falseClass="bg-white text-slate-500 border-slate-200"
                      />
                    ) : (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${row.is_free_mortgage ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {row.is_free_mortgage ? 'ฟรีจดจำนอง' : 'ไม่ฟรี'}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-1 min-w-[80px]">
                    {onChange ? (
                      <EditableCell value={row.year_1_rate} onChange={(v) => updateRow(idx, 'year_1_rate', v)} className="font-mono" />
                    ) : (
                      <span className="font-mono font-bold text-slate-800">{row.year_1_rate || '—'}</span>
                    )}
                  </td>
                  <td className="px-1 py-1 min-w-[80px]">
                    {onChange ? (
                      <EditableCell value={row.year_2_3_rate} onChange={(v) => updateRow(idx, 'year_2_3_rate', v)} className="font-mono" />
                    ) : (
                      <span className="font-mono font-bold text-slate-800">{row.year_2_3_rate || '—'}</span>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    {onChange ? (
                      <EditableCell
                        value={row.avg_3yr_rate}
                        type="number"
                        numeric
                        suffix="%"
                        onChange={(v) => updateRow(idx, 'avg_3yr_rate', v)}
                        className="font-mono"
                      />
                    ) : (
                      <span className="font-mono font-black text-rose-600">{row.avg_3yr_rate > 0 ? `${row.avg_3yr_rate}%` : '—'}</span>
                    )}
                  </td>
                  {!compact && (
                    <td className="px-1 py-1">
                      {onChange ? (
                        <EditableCell value={row.eir} type="number" numeric suffix="%" onChange={(v) => updateRow(idx, 'eir', v)} className="font-mono" />
                      ) : (
                        <span className="font-mono text-slate-600">{row.eir > 0 ? `${row.eir}%` : '—'}</span>
                      )}
                    </td>
                  )}
                  {onChange && (
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="ลบแถวนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      {onChange && rows.length > 0 && (
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-indigo-500" />
          คลิกที่เซลล์ใดก็ได้เพื่อแก้ไขค่าก่อนบันทึก — ค่า "เฉลี่ย 3 ปี" จะถูกคำนวณใหม่จากปีที่ 1 และปีที่ 2-3 โดยอัตโนมัติ
          <Check className="w-3 h-3 text-emerald-500" />
        </div>
      )}
      {!onChange && rows.length > 0 && (
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 font-semibold flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          โหมดอ่านอย่างเดียว — ระบบจะเลือก "แถวที่ดอกเบี้ยเฉลี่ย 3 ปีต่ำสุด" ที่ตรงเงื่อนไขผู้ใช้ให้อัตโนมัติ
        </div>
      )}
    </div>
  );
}
