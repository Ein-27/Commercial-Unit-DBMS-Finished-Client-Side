import { useState, useRef, useEffect, useMemo } from 'react';
import type { AppData, Lessee, Payment, PaymentMethod } from '../data/types';
import { createDepositPayments, generateId, getLesseeMonthStatus, getStoredAdvanceBalance, getYearsWithData, PAYMENT_METHOD_LABEL, isLesseeActiveForMonth, getLesseeRentForMonth, getMonthlyCollections, getMonthlyReceivables } from '../data/store';
import { enterToNext, getOrCreateTransactionSOA } from '../utils';
import { useConfirm, PrintTitleModal } from './ConfirmDialog';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n: number) => `₱${n.toLocaleString()}`;
const fmtReceivable = (n: number) => n < 0 ? `+${fmt(Math.abs(n))}` : fmt(n);
const METHODS: PaymentMethod[] = ['cash', 'check', 'digital'];

type SortKey = 'name-asc' | 'name-desc' | 'date-newest' | 'date-oldest' | 'block-asc' | 'block-desc' | 'unit-asc' | 'unit-desc';
type TableView = 'monthly' | 'annual';

interface Props {
  data: AppData;
  onUpdateData: (data: AppData) => void;
}

// ─── Payment Modal (monthly) ──────────────────────────────────────────────────
interface PaymentModalProps {
  lessee: Lessee; forMonth: string; mode: 'full' | 'partial' | 'advance-deposit';
  alreadyPaid: number;
  advBalance: number;
  onConfirm: (amount: number, method: PaymentMethod, type: Payment['type'], soa?: string, useAdvanceRemainder?: boolean) => void;
  onCancel: () => void;
}
function PaymentModal({ lessee, forMonth, mode, alreadyPaid, advBalance, onConfirm, onCancel }: PaymentModalProps) {
  const remaining = lessee.monthlyRent - alreadyPaid;
  const depositAmt = lessee.monthlyRent * 3;
  const isDeposit = mode === 'advance-deposit';
  const [amount, setAmount] = useState(
    isDeposit ? String(depositAmt) : mode === 'full' ? String(remaining) : ''
  );
  const [useAdvanceRemainder, setUseAdvanceRemainder] = useState(false);
  const partialAmount = parseFloat(amount) || 0;
  const remainingAfterPartial = Math.max(0, remaining - partialAmount);
  const canUseAdvanceRemainder = mode === 'partial' && partialAmount > 0 && partialAmount < remaining && advBalance >= remainingAfterPartial;
  const defaultDepAmt = depositAmt;
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [soaInput, setSoaInput] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { setErr('Enter a valid amount.'); return; }
    if (!isDeposit && val > remaining) { setErr(`Max remaining: ${fmt(remaining)}.`); return; }
    const soaNum = parseInt(soaInput);
    const soa = soaInput.trim() && !isNaN(soaNum) && soaNum > 0 ? String(soaNum).padStart(4, '0') : undefined;
    const type: Payment['type'] = isDeposit ? 'deposit_advance' : mode === 'full' ? 'monthly' : 'downpayment';
    onConfirm(val, method, type, soa, useAdvanceRemainder);
  };

  const [y, m] = forMonth.split('-');
  const monthLabel = `${MONTHS[parseInt(m) - 1]} ${y}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className={`px-6 py-4 rounded-t-xl ${isDeposit ? 'bg-yellow-600' : 'bg-blue-900'}`}>
          <h3 className="text-white font-semibold">
            {isDeposit ? 'Advance Deposit' : mode === 'full' ? 'Full Payment' : 'Partial Payment'}
          </h3>
          <p className={`text-sm mt-0.5 ${isDeposit ? 'text-yellow-100' : 'text-blue-200'}`}>{lessee.name} — {monthLabel}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" data-form>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            {isDeposit ? (
              <>
                <div className="flex justify-between text-gray-500 mb-1"><span>Default: 1 deposit + 2 advance = <strong>{fmt(defaultDepAmt)}</strong></span></div>
                <div className="flex justify-between text-gray-500 text-xs"><span>Amount is editable below</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-gray-500 mb-1"><span>Monthly Rent</span><span className="font-semibold text-gray-700">{fmt(lessee.monthlyRent)}</span></div>
                <div className="flex justify-between text-gray-500 mb-1"><span>Already Paid</span><span className="font-semibold text-green-600">{fmt(alreadyPaid)}</span></div>
                <div className="flex justify-between text-gray-500 border-t pt-1 mt-1"><span>Remaining</span><span className="font-bold text-gray-800">{fmt(remaining)}</span></div>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{isDeposit ? 'Amount (₱) — editable' : mode === 'full' ? 'Amount (auto-filled)' : 'Partial Amount (₱)'}</label>
            <input type="number" value={amount}
              onChange={e => { setAmount(e.target.value); setErr(''); }}
              onKeyDown={enterToNext}
              onWheel={e => (e.target as HTMLInputElement).blur()}
              readOnly={mode === 'full'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-100"
              placeholder="Enter amount" min="1" />
          </div>
          {!isDeposit && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Reference number <span className="text-gray-400">(optional)</span></label>
              <input type="number" value={soaInput}
                onChange={e => setSoaInput(e.target.value)}
                onKeyDown={enterToNext}
                onWheel={e => (e.target as HTMLInputElement).blur()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave blank to auto-generate" min="1" />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-2">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className={`py-2 px-1 rounded-lg text-xs border transition-colors ${method === m ? (isDeposit ? 'bg-yellow-600 text-white border-yellow-600' : 'bg-blue-900 text-white border-blue-900') : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                  {PAYMENT_METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          {mode === 'partial' && advBalance > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useAdvanceRemainder}
                  onChange={e => setUseAdvanceRemainder(e.target.checked)}
                  disabled={!canUseAdvanceRemainder}
                  className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                />
                <span className="text-gray-700">Use advance deposit balance to pay the remaining {fmt(remainingAfterPartial)}.</span>
              </label>
              {!canUseAdvanceRemainder && useAdvanceRemainder && (
                <p className="text-xs text-red-600 mt-2">You need at least {fmt(remainingAfterPartial)} of advance balance.</p>
              )}
            </div>
          )}
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" className={`flex-1 py-2 text-white rounded-lg text-sm ${isDeposit ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-900 hover:bg-blue-800'}`}>Confirm Payment</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Cell Pay Modal (annual view — click on month cell) ──────────────────────
interface CellPayModalProps {
  lessee: Lessee; forMonth: string; data: AppData;
  onConfirm: (forMonth: string, amount: number, method: PaymentMethod, type: Payment['type'], useAdvanceRemainder?: boolean) => void;
  onClear: () => void;
  onCancel: () => void;
}
function CellPayModal({ lessee, forMonth, data, onConfirm, onClear, onCancel }: CellPayModalProps) {
  const existingPayments = data.payments.filter(p => p.lesseeId === lessee.id && p.forMonth === forMonth && p.type !== 'deposit_advance');
  const hasAdvanceDeposit = data.payments.some(p => p.lesseeId === lessee.id && p.forMonth === forMonth && p.type === 'deposit_advance');
  const hasNewLesseeDeposit = data.payments.some(p => p.lesseeId === lessee.id && p.forMonth === forMonth && p.type === 'deposit_advance' && p.notes === 'new_lessee_advance_deposit');
  const hasPayments = existingPayments.length > 0;
  const [mode, setMode] = useState<'full' | 'partial' | 'advance-used' | 'clear'>(hasNewLesseeDeposit ? 'clear' : 'full');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [partialAmt, setPartialAmt] = useState('');
  const [useAdvanceRemainder, setUseAdvanceRemainder] = useState(false);
  const [err, setErr] = useState('');

  const alreadyPaid = existingPayments.reduce((s, p) => s + p.amount, 0);
  const remaining = lessee.monthlyRent - alreadyPaid;
  const advBalance = getStoredAdvanceBalance(data.payments, lessee.id);
  const partialValue = parseFloat(partialAmt) || 0;
  const remainingAfterPartial = Math.max(0, remaining - partialValue);
  const canUseAdvanceRemainder = mode === 'partial' && partialValue > 0 && partialValue < remaining && advBalance >= remainingAfterPartial;

  const [y, m] = forMonth.split('-');
  const monthLabel = `${MONTHS[parseInt(m) - 1]} ${y}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'clear') { onClear(); return; }
    if (mode === 'advance-used') {
      if (advBalance < lessee.monthlyRent) { setErr('Insufficient advance balance.'); return; }
      onConfirm(forMonth, lessee.monthlyRent, method, 'advance_used');
      return;
    }
    if (mode === 'full') {
      onConfirm(forMonth, remaining, method, 'monthly');
      return;
    }
    const val = parseFloat(partialAmt);
    if (isNaN(val) || val <= 0) { setErr('Enter a valid amount.'); return; }
    if (val > remaining) { setErr(`Max remaining: ${fmt(remaining)}`); return; }
    onConfirm(forMonth, val, method, 'downpayment');
  };

  const payTypes: { key: 'full' | 'partial' | 'advance-used' | 'clear'; label: string }[] = hasNewLesseeDeposit ? [
    { key: 'clear', label: 'Clear Deposit' },
  ] : [
    { key: 'full', label: 'Full Pay' },
    { key: 'partial', label: 'Partial' },
    { key: 'advance-used', label: 'Advance Bal.' },
    ...(hasPayments ? [{ key: 'clear' as const, label: 'Clear Payment' }] : []),
  ];

  const isClear = mode === 'clear';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className={`px-6 py-4 rounded-t-xl ${isClear ? 'bg-red-700' : 'bg-blue-900'}`}>
          <h3 className="text-white font-semibold">{isClear ? 'Clear Month Payment' : 'Make Payment'}</h3>
          <p className={`text-sm mt-0.5 ${isClear ? 'text-red-200' : 'text-blue-200'}`}>{lessee.name} — {monthLabel}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" data-form>
          <div>
            <label className="block text-sm text-gray-600 mb-2">Payment Type</label>
            <div className={`grid gap-2 ${payTypes.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {payTypes.map(t => (
                <button key={t.key} type="button"
                  onClick={() => { setMode(t.key); setPartialAmt(''); setErr(''); }}
                  className={`py-2 rounded-lg text-xs border transition-colors ${
                    mode === t.key
                      ? t.key === 'clear' ? 'bg-red-600 text-white border-red-600' : 'bg-blue-900 text-white border-blue-900'
                      : t.key === 'clear' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {isClear ? (
            <div className="bg-red-50 rounded-lg p-3 text-sm border border-red-200">
              <p className="text-red-700 font-medium">This will remove all payments for {monthLabel}.</p>
              <p className="text-red-500 text-xs mt-1">Already paid: {fmt(alreadyPaid)}</p>
            </div>
          ) : mode === 'advance-used' ? (
            <div className="bg-yellow-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-yellow-700 mb-1"><span>Advance Balance</span><span className="font-bold">{fmt(advBalance)}</span></div>
              <div className="flex justify-between text-yellow-600"><span>Monthly Rent</span><span className="font-semibold">{fmt(lessee.monthlyRent)}</span></div>
              {advBalance < lessee.monthlyRent && <p className="text-red-500 text-xs mt-2">Insufficient balance to pay this month.</p>}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-gray-500 mb-1"><span>Monthly Rent</span><span className="font-semibold text-gray-700">{fmt(lessee.monthlyRent)}</span></div>
              <div className="flex justify-between text-gray-500 mb-1"><span>Already Paid</span><span className="font-semibold text-green-600">{fmt(alreadyPaid)}</span></div>
              <div className="flex justify-between text-gray-500 border-t pt-1 mt-1"><span>Remaining</span><span className="font-bold text-gray-800">{fmt(remaining)}</span></div>
            </div>
          )}
          {mode === 'partial' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Partial Amount (₱)</label>
                <input type="number" value={partialAmt}
                  onChange={e => { setPartialAmt(e.target.value); setErr(''); setUseAdvanceRemainder(false); }}
                  onKeyDown={enterToNext}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount" min="1" max={remaining} />
              </div>
              {advBalance > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useAdvanceRemainder}
                      onChange={e => setUseAdvanceRemainder(e.target.checked)}
                      disabled={!canUseAdvanceRemainder}
                      className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className="text-gray-700">Use advance deposit balance to pay remaining {fmt(remainingAfterPartial)}.</span>
                  </label>
                  {!canUseAdvanceRemainder && useAdvanceRemainder && (
                    <p className="text-xs text-red-600 mt-2">You need at least {fmt(remainingAfterPartial)} of advance balance.</p>
                  )}
                </div>
              )}
            </div>
          )}
          {!isClear && (
            <div>
              <label className="block text-sm text-gray-600 mb-2">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(mth => (
                  <button key={mth} type="button" onClick={() => setMethod(mth)}
                    className={`py-2 px-1 rounded-lg text-xs border capitalize transition-colors ${method === mth ? (mode === 'advance-used' ? 'bg-yellow-600 text-white border-yellow-600' : 'bg-blue-900 text-white border-blue-900') : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {PAYMENT_METHOD_LABEL[mth]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit"
              disabled={mode === 'advance-used' && advBalance < lessee.monthlyRent}
              className={`flex-1 py-2 text-white rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed ${isClear ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-900 hover:bg-blue-800'}`}>
              {isClear ? 'Clear Payment' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SortGroup({ label, ascKey, descKey, current, onSelect }: {
  label: string; ascKey: SortKey; descKey: SortKey; current: SortKey; onSelect: (k: SortKey) => void;
}) {
  const asc2 = ascKey.includes('date') ? 'Newest' : ascKey.includes('unit') ? '↑' : 'A–Z';
  const desc2 = descKey.includes('date') ? 'Oldest' : descKey.includes('unit') ? '↓' : 'Z–A';
  return (
    <div className="flex items-center">
      <span className="text-xs text-gray-400 mr-1">{label}:</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-300">
        <button onClick={() => onSelect(ascKey)}
          className={`px-2.5 py-1 text-xs border-r border-gray-300 transition-colors ${current === ascKey ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          {asc2}
        </button>
        <button onClick={() => onSelect(descKey)}
          className={`px-2.5 py-1 text-xs transition-colors ${current === descKey ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          {desc2}
        </button>
      </div>
    </div>
  );
}

export function Sales({ data, onUpdateData }: Props) {
  const [view, setView] = useState<TableView>('monthly');
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [search, setSearch] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [payModal, setPayModal] = useState<{ lessee: Lessee; mode: 'full' | 'partial' | 'advance-deposit'; alreadyPaid: number } | null>(null);
  const [cellPayModal, setCellPayModal] = useState<{ lessee: Lessee; forMonth: string } | null>(null);
  const [advMethodModal, setAdvMethodModal] = useState<{ lessee: Lessee; forMonth: string } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const { ask, dialog: confirmDialog } = useConfirm();
  const [printCallback, setPrintCallback] = useState<((title: string) => void) | null>(null);

  const currentMonthStr = `${year}-${String(month).padStart(2, '0')}`;
  const today = new Date();

  // Keep an internal clock-year that updates at the start of each new year so
  // the UI will include the new year immediately even if no data exists yet.
  const [clockYear, setClockYear] = useState<number>(new Date().getFullYear());
  useEffect(() => {
    const now = new Date();
    const nextYearDate = new Date(now.getFullYear() + 1, 0, 1);
    const ms = nextYearDate.getTime() - now.getTime();
    const id = setTimeout(() => setClockYear(new Date().getFullYear()), ms + 1000);
    return () => clearTimeout(id);
  }, [clockYear]);

  const yearsFromData = getYearsWithData(data);
  const years = useMemo(() => {
    const s = new Set<number>(yearsFromData);
    s.add(clockYear);
    return Array.from(s).sort((a, b) => a - b);
  }, [yearsFromData, clockYear]);

  useEffect(() => {
    if (!years.includes(year)) {
      setYear(years[years.length - 1] ?? new Date().getFullYear());
    }
  }, [years, year]);

  const getBlock = (l: Lessee) => data.blocks.find(b => b.id === l.blockId)?.name ?? '';
  const getUnit = (l: Lessee) => data.units.find(u => u.id === l.unitId)?.number ?? '';

  const getAllUnitIds = (l: Lessee): string[] => [...new Set([l.unitId, ...(l.unitIds ?? [])].filter(Boolean))];

  const getBlockMap = (l: Lessee): Map<string, string[]> => {
    const allUnitIds = getAllUnitIds(l);
    const map = new Map<string, string[]>();
    allUnitIds.forEach(uid => {
      const unit = data.units.find(u => u.id === uid);
      const block = data.blocks.find(b => b.id === unit?.blockId);
      if (!block || !unit) return;
      if (!map.has(block.name)) map.set(block.name, []);
      map.get(block.name)!.push(unit.number);
    });
    return map;
  };

  const getLesseeBlocks = (l: Lessee): string[] => [...getBlockMap(l).keys()];

  const canPayForMonth = (lessee: Lessee, forMonth: string): boolean =>
    isLesseeActiveForMonth(lessee, forMonth);

  const activeLessees = data.lessees.filter(l => l.isActive);

  const sorted = [...activeLessees].sort((a, b) => {
    const ba = getBlock(a), bb = getBlock(b);
    const ua = getUnit(a), ub = getUnit(b);
    if (sortKey === 'name-asc') return a.name.localeCompare(b.name);
    if (sortKey === 'name-desc') return b.name.localeCompare(a.name);
    if (sortKey === 'date-newest') return b.startDate.localeCompare(a.startDate);
    if (sortKey === 'date-oldest') return a.startDate.localeCompare(b.startDate);
    if (sortKey === 'block-asc') return ba.localeCompare(bb) || parseInt(ua) - parseInt(ub);
    if (sortKey === 'block-desc') return bb.localeCompare(ba) || parseInt(ua) - parseInt(ub);
    if (sortKey === 'unit-asc') return parseInt(ua) - parseInt(ub);
    if (sortKey === 'unit-desc') return parseInt(ub) - parseInt(ua);
    return 0;
  });

  const filtered = sorted.filter(l => {
    const q = search.toLowerCase();
    if (locFilter && l.locationId !== locFilter) return false;
    if (blockFilter && !getLesseeBlocks(l).includes(blockFilter)) return false;
    return !q || l.name.toLowerCase().includes(q) || (l.soa ?? '').includes(q) ||
      getBlock(l).toLowerCase().includes(q) || getUnit(l).includes(q);
  });

  const getMonthlyPaidForDisplay = (lessee: Lessee, forMonth: string): number => {
    const monthPayments = data.payments.filter(p => p.lesseeId === lessee.id && p.forMonth === forMonth);
    const advanceDeposit = monthPayments
      .filter(p => p.type === 'deposit_advance')
      .reduce((sum, p) => sum + p.amount, 0);
    if (advanceDeposit > 0) return advanceDeposit;
    const hasAdvanceDeposit = monthPayments.some(p => p.type === 'deposit_advance');
    return monthPayments
      .filter(p => p.type === 'monthly' || p.type === 'downpayment' || (p.type === 'advance_used' && !hasAdvanceDeposit))
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const allBlockLetters = [...new Set(activeLessees.flatMap(l => getLesseeBlocks(l)))].sort();

  interface BlockRow { lessee: Lessee; blockName: string; units: string[] }
  const expandToBlockRows = (l: Lessee): BlockRow[] => {
    const bm = getBlockMap(l);
    if (bm.size === 0) return [{ lessee: l, blockName: getBlock(l), units: getUnit(l) ? [getUnit(l)] : [] }];
    return [...bm.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([blockName, units]) => ({ lessee: l, blockName, units: units.sort((a, b) => parseInt(a) - parseInt(b)) }));
  };

  const expandedRows = filtered.flatMap(l => expandToBlockRows(l));

  const recordPayment = (
    lessee: Lessee, forMonth: string, amount: number, method: PaymentMethod,
    type: Payment['type'], soaOverride?: string
  ) => {
    if (!canPayForMonth(lessee, forMonth)) return;
    const hasAdvanceDeposit = data.payments.some(p =>
      p.lesseeId === lessee.id && p.forMonth === forMonth && p.type === 'deposit_advance'
    );
    const hasNewLesseeDeposit = data.payments.some(p =>
      p.lesseeId === lessee.id && p.forMonth === forMonth && p.type === 'deposit_advance' && p.notes === 'new_lessee_advance_deposit'
    );
    if (type !== 'deposit_advance' && hasNewLesseeDeposit) return;
    if (type === 'deposit_advance') {
      const newPayments = createDepositPayments(
        lessee.id,
        lessee.monthlyRent,
        amount,
        method,
        forMonth,
        data.payments,
        false,
        'deposit_advance'
      );
      onUpdateData({ ...data, payments: [...data.payments, ...newPayments] });
      return;
    }
    const totalDue = lessee.monthlyRent;
    const alreadyPaid = data.payments
      .filter(p => p.lesseeId === lessee.id && p.forMonth === forMonth && p.type !== 'deposit_advance')
      .reduce((s, p) => s + p.amount, 0);
    const remaining = totalDue - alreadyPaid;
    const actualAmount = Math.min(amount, remaining);
    if (actualAmount <= 0) return;
    const soa = soaOverride ?? getOrCreateTransactionSOA(data.payments, lessee.id, forMonth);
    const newPayment: Payment = {
      id: generateId(), lesseeId: lessee.id, soa, amount: actualAmount, totalDue,
      date: new Date().toISOString().split('T')[0], method, type, forMonth,
      isComplete: alreadyPaid + actualAmount >= totalDue,
    };
    onUpdateData({ ...data, payments: [...data.payments, newPayment] });
  };

  const recordAdvanceUsed = (lessee: Lessee, forMonth: string, method: PaymentMethod = 'cash', amount?: number) => {
    if (!canPayForMonth(lessee, forMonth)) return;
    const hasNewLesseeDeposit = data.payments.some(p =>
      p.lesseeId === lessee.id && p.forMonth === forMonth && p.type === 'deposit_advance' && p.notes === 'new_lessee_advance_deposit'
    );
    if (hasNewLesseeDeposit) return;
    const useAmount = amount ?? lessee.monthlyRent;
    const balance = getStoredAdvanceBalance(data.payments, lessee.id);
    if (balance < useAmount) return;
    const soa = getOrCreateTransactionSOA(data.payments, lessee.id, forMonth);
    const newPayment: Payment = {
      id: generateId(), lesseeId: lessee.id, soa,
      amount: useAmount, totalDue: lessee.monthlyRent,
      date: new Date().toISOString().split('T')[0],
      method, type: 'advance_used', forMonth, isComplete: true,
    };
    onUpdateData({ ...data, payments: [...data.payments, newPayment] });
  };

  const recordCombinedPartialAdvance = (
    lessee: Lessee,
    forMonth: string,
    amount: number,
    method: PaymentMethod,
    soaOverride?: string
  ) => {
    if (!canPayForMonth(lessee, forMonth)) return;
    const hasNewLesseeDeposit = data.payments.some(p =>
      p.lesseeId === lessee.id && p.forMonth === forMonth && p.type === 'deposit_advance' && p.notes === 'new_lessee_advance_deposit'
    );
    if (hasNewLesseeDeposit) return;
    const alreadyPaid = data.payments
      .filter(p => p.lesseeId === lessee.id && p.forMonth === forMonth && p.type !== 'deposit_advance')
      .reduce((s, p) => s + p.amount, 0);
    const remainingBefore = lessee.monthlyRent - alreadyPaid;
    const actualAmount = Math.min(amount, remainingBefore);
    const combinedAmount = actualAmount + Math.max(0, remainingBefore - actualAmount);
    const balance = getStoredAdvanceBalance(data.payments, lessee.id);
    if (balance < Math.max(0, remainingBefore - actualAmount)) return;
    const soa = soaOverride ?? getOrCreateTransactionSOA(data.payments, lessee.id, forMonth);
    const newPayment: Payment = {
      id: generateId(), lesseeId: lessee.id, soa,
      amount: combinedAmount, totalDue: lessee.monthlyRent,
      date: new Date().toISOString().split('T')[0],
      method, type: 'advance_used', forMonth, isComplete: true,
    };
    onUpdateData({ ...data, payments: [...data.payments, newPayment] });
  };

  const undoLastPayment = (lessee: Lessee, forMonth: string) => {
    const toRemove = [...data.payments]
      .filter(p => p.lesseeId === lessee.id && p.forMonth === forMonth && p.type !== 'deposit_advance')
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (toRemove) onUpdateData({ ...data, payments: data.payments.filter(p => p.id !== toRemove.id) });
  };

  const undoLastDeposit = (lessee: Lessee) => {
    const deposits = data.payments
      .filter(p => p.lesseeId === lessee.id && p.type === 'deposit_advance')
      .sort((a, b) => b.date.localeCompare(a.date));
    if (deposits[0]) onUpdateData({ ...data, payments: data.payments.filter(p => p.id !== deposits[0].id) });
  };

  const clearMonthPayments = (lessee: Lessee, forMonth: string) => {
    ask(`Clear all payments for ${lessee.name} this month?`, () => {
      onUpdateData({
        ...data,
        payments: data.payments.filter(p => !(p.lesseeId === lessee.id && p.forMonth === forMonth && p.type !== 'deposit_advance')),
      });
    });
  };

  const clearDeposits = (lessee: Lessee) => {
    ask(`Clear all advance deposits for ${lessee.name}? This cannot be undone.`, () => {
      onUpdateData({
        ...data,
        payments: data.payments.filter(p => !(p.lesseeId === lessee.id && p.type === 'deposit_advance')),
      });
    });
  };

  const clearMonthDeposit = (lessee: Lessee, forMonth: string) => {
    ask(`Clear the advance deposit for ${lessee.name} this month?`, () => {
      onUpdateData({
        ...data,
        payments: data.payments.filter(p => !(p.lesseeId === lessee.id && p.forMonth === forMonth && (p.type === 'deposit_advance' || p.type === 'advance_used'))),
      });
    });
  };

  const handlePayConfirm = (amount: number, method: PaymentMethod, type: Payment['type'], soa?: string, useAdvanceRemainder?: boolean) => {
    if (!payModal) return;
    if (type === 'deposit_advance') {
      recordPayment(payModal.lessee, currentMonthStr, amount, method, type, soa);
      setPayModal(null);
      return;
    }
    if (type === 'downpayment' && useAdvanceRemainder) {
      recordCombinedPartialAdvance(payModal.lessee, currentMonthStr, amount, method, soa);
      setPayModal(null);
      return;
    }
    recordPayment(payModal.lessee, currentMonthStr, amount, method, type, soa);
    setPayModal(null);
  };

  const openPayModal = (lessee: Lessee, mode: 'full' | 'partial' | 'advance-deposit') => {
    if (!canPayForMonth(lessee, currentMonthStr)) return;
    const alreadyPaid = data.payments
      .filter(p => p.lesseeId === lessee.id && p.forMonth === currentMonthStr && p.type !== 'deposit_advance')
      .reduce((s, p) => s + p.amount, 0);
    setPayModal({ lessee, mode, alreadyPaid });
  };

  const handleCellPayConfirm = (forMonth: string, amount: number, method: PaymentMethod, type: Payment['type'], useAdvanceRemainder?: boolean) => {
    if (!cellPayModal) return;
    if (!canPayForMonth(cellPayModal.lessee, forMonth)) {
      setCellPayModal(null);
      return;
    }
    if (type === 'advance_used') {
      recordAdvanceUsed(cellPayModal.lessee, forMonth, method);
    } else if (type === 'downpayment' && useAdvanceRemainder) {
      recordCombinedPartialAdvance(cellPayModal.lessee, forMonth, amount, method);
    } else {
      recordPayment(cellPayModal.lessee, forMonth, amount, method, type);
    }
    setCellPayModal(null);
  };

  const handleCellClear = () => {
    if (!cellPayModal) return;
    const { lessee, forMonth } = cellPayModal;
    const hasNewLesseeDeposit = data.payments.some(p =>
      p.lesseeId === lessee.id && p.forMonth === forMonth && p.type === 'deposit_advance' && p.notes === 'new_lessee_advance_deposit'
    );
    onUpdateData({
      ...data,
      payments: data.payments.filter(p => !(p.lesseeId === lessee.id && p.forMonth === forMonth && (hasNewLesseeDeposit ? p.type === 'deposit_advance' && p.notes === 'new_lessee_advance_deposit' : p.type !== 'deposit_advance'))),
    });
    setCellPayModal(null);
  };

  const [showPrintFormat, setShowPrintFormat] = useState(false);

  // ─── Print ────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (view === 'annual') {
      setShowPrintFormat(true);
    } else {
      setPrintCallback(() => (title: string) => doPrintMonthly(title));
    }
  };

  const doPrintMonthly = (reportTitle: string) => {
    const [y, m] = currentMonthStr.split('-');
    const title = reportTitle.trim() || `Sales Report — ${MONTHS[parseInt(m)-1]} ${y}`;
    const rows = filtered.flatMap(l => {
      const ms = getLesseeMonthStatus(data.payments, l, currentMonthStr);
      const pays = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === currentMonthStr && p.type !== 'deposit_advance');
      const methods = [...new Set(pays.map(p => PAYMENT_METHOD_LABEL[p.method]))].join(', ') || (ms.isAdvance ? 'Advance' : '—');
      const advPays = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === currentMonthStr && p.type === 'deposit_advance');
      const advAmt = advPays.reduce((s, p) => s + p.amount, 0);
      return expandToBlockRows(l).map((r, ri) => {
        const monthlyPaid = getMonthlyPaidForDisplay(l, currentMonthStr);
        const paidValue = monthlyPaid + advAmt;
        const paidStyle = monthlyPaid > 0 ? 'color:#16a34a' : '';
        return `<tr><td>${l.name}</td><td>${r.blockName}</td><td>${r.units.join(', ')}</td>` +
        `<td style="text-align:right">${fmt(getLesseeRentForMonth(data.payments, l, currentMonthStr))}</td>` +
        `<td style="text-align:right">${PAYMENT_METHOD_LABEL[pays[0]?.method ?? 'cash'] || '—'}</td>` +
        `<td style="text-align:right;${paidStyle}">${paidValue > 0 ? fmt(paidValue) : '—'}</td></tr>`;
      });
    }).join('');
    const totalCollected = filtered.reduce((s, l) => s + getLesseeMonthStatus(data.payments, l, currentMonthStr).paid, 0);
    const totalAdvance = data.payments.filter(p => p.forMonth === currentMonthStr && p.type === 'deposit_advance' && filtered.some(l => l.id === p.lesseeId)).reduce((s, p) => s + p.amount, 0);
    const totalSales = filtered.reduce((s, l) => s + getLesseeRentForMonth(data.payments, l, currentMonthStr), 0);
    const totalIncome = totalSales + totalAdvance;
    const receivables = totalSales - totalCollected;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>R. A. Del Rosario Construction</title>
      <style>body{font-family:sans-serif;font-size:12px;padding:20px}h1{font-size:16px}h2{font-size:13px;color:#555;font-weight:normal}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 10px}th{background:#1e3a5f;color:#fff}tr:nth-child(even){background:#f9f9f9}.summ{margin-top:16px;border-top:2px solid #1e3a5f;padding-top:10px}.srow{display:flex;justify-content:space-between;padding:2px 4px;border-bottom:1px solid #eee}</style>
    </head><body>
      <h1>R. A. Del Rosario Construction</h1><h2>${title}</h2>
      <table><thead><tr><th>Name</th><th>Block</th><th>Unit</th><th style="text-align:right">Rent/mo</th><th>Method</th><th style="text-align:right">Paid</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="summ">
        <div class="srow"><span>Monthly Collections</span><span>${fmt(totalCollected)}</span></div>
        <div class="srow"><span>Advance Deposit</span><span>${fmt(totalAdvance)}</span></div>
        <div class="srow" style="font-weight:bold"><span>Total Income</span><span>${fmt(totalIncome)}</span></div>
        <div class="srow" style="color:${receivables < 0 ? '#16a34a' : '#dc2626'}"><span>Receivables</span><span>${fmtReceivable(receivables)}</span></div>
        <div class="srow" style="border-bottom:none;color:#1e40af"><span>Total Sales</span><span>${fmt(totalSales)}</span></div>
      </div>
    </body></html>`);
    win.document.close(); win.print();
  };

  const CSS_BASE = `body{font-family:sans-serif;font-size:11px;padding:20px}h1{font-size:16px;margin:0 0 2px}h2{font-size:13px;color:#555;font-weight:normal;margin:0 0 12px}h3{font-size:12px;color:#1e3a5f;margin:18px 0 4px}table{width:100%;border-collapse:collapse;margin-bottom:4px}th,td{border:1px solid #ddd;padding:4px 8px}th{background:#1e3a5f;color:#fff}tr:nth-child(even){background:#f9f9f9}.summ-row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px}.summ-section{border-top:2px solid #1e3a5f;margin-top:6px;padding-top:4px}.grand-total{margin-top:24px;padding-top:12px;border-top:3px solid #1e3a5f}.grand-title{font-size:13px;font-weight:bold;color:#1e3a5f;margin-bottom:6px}`;

  // Format A: By Month — each month on its own section with all lessees, summary, then grand total page
  const doPrintByMonth = (reportTitle: string) => {
    const title = reportTitle.trim() || `Annual Sales Report — ${year}`;
    const win = window.open('', '_blank');
    if (!win) return;
    let html = `<!DOCTYPE html><html><head><title>R.A. Del Rosario Construction</title><style>${CSS_BASE}</style></head><body>
      <h1>R.A. Del Rosario Construction</h1><h2>${title}</h2>`;

    let grandCollected = 0, grandAdvDeposit = 0, grandTotalSales = 0, grandReceivables = 0;
    let firstSection = true;

    for (let mi = 0; mi < 12; mi++) {
      const mStr = `${year}-${String(mi + 1).padStart(2, '0')}`;
      const isFuture = new Date(year, mi, 1) > today;
      const mRows = filtered.flatMap(l => {
        const ms = getLesseeMonthStatus(data.payments, l, mStr);
        const pays = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === mStr && p.type !== 'deposit_advance');
        const advPays = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === mStr && p.type === 'deposit_advance');
        const methods = [...new Set(pays.map(p => PAYMENT_METHOD_LABEL[p.method]))].join(', ') || (ms.isAdvance ? 'Advance' : '—');
        const advAmt = advPays.reduce((s, p) => s + p.amount, 0);
        const monthlyPaid = getMonthlyPaidForDisplay(l, mStr);
        const combinedPaid = monthlyPaid + advAmt;
        const paidColor = monthlyPaid > 0
          ? '#16a34a'
          : (ms.status === 'paid' || ms.isAdvance ? '#16a34a' : ms.status === 'partial' ? '#ea580c' : '#dc2626');
        return expandToBlockRows(l).map((r, ri) => {
          return `<tr><td>${l.name}</td><td>Blk ${r.blockName}</td><td>${r.units.join(', ')}</td>` +
          `<td style="text-align:right">${fmt(getLesseeRentForMonth(data.payments, l, mStr))}</td>` +
          `<td>${methods}</td>` +
          `<td style="text-align:right;color:${paidColor}">${combinedPaid > 0 ? fmt(combinedPaid) : '—'}</td>` +
          `</tr>`;
        });
      }).join('');

      const monthCollected = getMonthlyCollections(data.payments, filtered, mStr);
      const monthAdvDeposit = data.payments.filter(p => p.forMonth === mStr && p.type === 'deposit_advance' && filtered.some(l => l.id === p.lesseeId)).reduce((s, p) => s + p.amount, 0);
      const monthTotalSales = isFuture ? 0 : filtered.reduce((s, l) => s + getLesseeRentForMonth(data.payments, l, mStr), 0);
      const monthTotalIncome = monthTotalSales + monthAdvDeposit;
      const monthReceivables = isFuture ? 0 : getMonthlyReceivables(data.payments, filtered, mStr);

      grandCollected += monthCollected;
      grandAdvDeposit += monthAdvDeposit;
      grandTotalSales += monthTotalSales;
      grandReceivables += monthReceivables;

      firstSection = false;
      html += `<h3>${MONTHS[mi]} ${year}</h3>
        <table><thead><tr><th>Name</th><th>Block</th><th>Unit</th><th style="text-align:right">Rent/mo</th><th>Method</th><th style="text-align:right">Paid</th></tr></thead>
        <tbody>${mRows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af">No payments this month</td></tr>'}</tbody></table>
        <div class="summ-section">
          <div class="summ-row" style="color:#1e40af"><span>Total Sales</span><span>${isFuture ? '—' : fmt(monthTotalSales)}</span></div>
          <div class="summ-row" style="color:#b45309"><span>Advance Deposit</span><span>${fmt(monthAdvDeposit)}</span></div>
          <div class="summ-row" style="font-weight:bold;color:#7c3aed"><span>Total Income</span><span>${fmt(monthTotalIncome)}</span></div>
          <div class="summ-row" style="color:#16a34a"><span>Monthly Collections</span><span>${fmt(monthCollected)}</span></div>
          <div class="summ-row" style="color:${monthReceivables < 0 ? '#16a34a' : '#dc2626'}"><span>Receivables</span><span>${isFuture ? '—' : fmtReceivable(monthReceivables)}</span></div>
        </div>`;
    }

    const grandTotalIncome = grandTotalSales + grandAdvDeposit;
    html += `<div class="grand-total">
        <div class="grand-title">Grand Total — ${year}</div>
        <div class="summ-row" style="color:#1e40af"><span>Total Sales</span><span>${fmt(grandTotalSales)}</span></div>
        <div class="summ-row" style="color:#b45309"><span>Total Advance Deposits</span><span>${fmt(grandAdvDeposit)}</span></div>
        <div class="summ-row" style="font-weight:bold;color:#7c3aed"><span>Total Income</span><span>${fmt(grandTotalIncome)}</span></div>
        <div class="summ-row" style="color:#16a34a"><span>Total Monthly Collections</span><span>${fmt(grandCollected)}</span></div>
        <div class="summ-row" style="color:${grandReceivables < 0 ? '#16a34a' : '#dc2626'}"><span>Total Receivables</span><span>${fmtReceivable(grandReceivables)}</span></div>
      </div>
    </body></html>`;
    win.document.write(html);
    win.document.close(); win.print();
  };

  // Format B: By Name — each lessee with their 12-month table (total + AP), grand total at bottom
  const doPrintByName = (reportTitle: string) => {
    const title = reportTitle.trim() || `Annual Sales Report — ${year} (By Name)`;
    const win = window.open('', '_blank');
    if (!win) return;
    let html = `<!DOCTYPE html><html><head><title>R.A. Del Rosario Construction</title><style>${CSS_BASE}
      .lessee-section{margin-bottom:20px}.lessee-header{font-size:12px;font-weight:bold;color:#1e3a5f;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:4px}.lessee-sub{font-size:10px;color:#6b7280;margin-bottom:4px}
    </style></head><body>
      <h1>R.A. Del Rosario Construction</h1><h2>${title}</h2>`;

    let grandTotal = 0, grandAP = 0;

    filtered.forEach((l, li) => {
      const divider = li > 0 ? '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">' : '';
      const blockUnits = expandToBlockRows(l).map(r => `Blk ${r.blockName} / Units ${r.units.join(', ')}`).join(' · ');
      const loc = data.locations.find(loc => loc.id === l.locationId)?.name ?? '';

      let monthRows = '';
      let lesseeTotal = 0, lesseeAP = 0;

      for (let mi = 0; mi < 12; mi++) {
        const mStr = `${year}-${String(mi + 1).padStart(2, '0')}`;
        const isFuture = new Date(year, mi, 1) > today;
        const ms = getLesseeMonthStatus(data.payments, l, mStr);
        const pays = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === mStr && p.type !== 'deposit_advance');
        const advPays = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === mStr && p.type === 'deposit_advance');
        const paid = getMonthlyPaidForDisplay(l, mStr);
        const advDep = advPays.reduce((s, p) => s + p.amount, 0);
        const combinedPaid = paid + advDep;
        const ap = isFuture || !isLesseeActiveForMonth(l, mStr) ? 0 : Math.max(0, getLesseeRentForMonth(data.payments, l, mStr) - paid);
        const statusColor = ms.status === 'paid' || ms.isAdvance ? '#16a34a' : ms.status === 'partial' ? '#ea580c' : '#dc2626';
        const paidColor = paid > 0 ? '#16a34a' : statusColor;
        const methods = [...new Set(pays.map(p => PAYMENT_METHOD_LABEL[p.method]))].join(', ') || (ms.isAdvance ? 'Advance' : '—');

        lesseeTotal += combinedPaid;
        lesseeAP += ap;

        monthRows += `<tr>
          <td>${MONTHS[mi]}</td>
          <td>${methods}</td>
          <td style="text-align:right;color:${paidColor}">${combinedPaid > 0 ? fmt(combinedPaid) : '—'}</td>
          <td style="text-align:right;color:#dc2626">${isFuture ? '—' : ap > 0 ? fmt(ap) : '—'}</td>
        </tr>`;
      }

      grandTotal += lesseeTotal;
      grandAP += lesseeAP;

      html += `${divider}<div class="lessee-section">
        <div class="lessee-header">${l.name}${l.soa ? ` — SOA #${l.soa}` : ''}</div>
        <div class="lessee-sub">${loc} · ${blockUnits} · Rent: ${fmt(l.monthlyRent)}/mo</div>
        <table><thead><tr><th>Month</th><th>Method</th><th style="text-align:right">Paid</th><th style="text-align:right">AP</th></tr></thead>
        <tbody>${monthRows}
          <tr style="font-weight:bold;background:#f0f4ff">
            <td colspan="2">Total</td>
            <td style="text-align:right;color:#16a34a">${fmt(lesseeTotal)}</td>
            <td style="text-align:right;color:#dc2626">${fmt(lesseeAP)}</td>
          </tr>
        </tbody></table>
      </div>`;
    });

    html += `<div class="grand-total">
      <div class="grand-title">Grand Total — All Lessees · ${year}</div>
      <div class="summ-row" style="color:#16a34a"><span>Total Collections</span><span>${fmt(grandTotal)}</span></div>
      <div class="summ-row" style="color:#dc2626"><span>Total AP (Accounts Payable)</span><span>${fmt(grandAP)}</span></div>
    </div></body></html>`;
    win.document.write(html);
    win.document.close(); win.print();
  };

  // ─── Summary data ─────────────────────────────────────────────────────────
  const summaryByLoc = data.locations.filter(loc => !locFilter || loc.id === locFilter).map(loc => {
    const locLessees = data.lessees.filter(l => l.locationId === loc.id);
    const locLesseeIds = new Set(locLessees.map(l => l.id));

    const monthlyBreakdown = MONTHS.map((label, mi) => {
      const mStr = `${year}-${String(mi + 1).padStart(2, '0')}`;
      const isFuture = new Date(year, mi, 1) > today;
      const collected = getMonthlyCollections(data.payments, locLessees, mStr);
      const advance = data.payments
        .filter(p => p.forMonth === mStr && p.type === 'deposit_advance' && locLesseeIds.has(p.lesseeId))
        .reduce((s, p) => s + p.amount, 0);
      const totalSales = isFuture ? 0 : locLessees.reduce((s, l) => s + (isLesseeActiveForMonth(l, mStr) ? getLesseeRentForMonth(data.payments, l, mStr) : 0), 0);
      const receivables = isFuture ? 0 : getMonthlyReceivables(data.payments, locLessees, mStr);
      const totalIncome = totalSales + advance;
      return { label, mStr, collected, advance, totalSales, receivables, totalIncome, isFuture };
    });

    return { loc, monthlyBreakdown };
  });

  // Current month totals for bottom bar (respects locFilter)
  const curMonthIdx = month - 1;
  const curLocData = summaryByLoc.flatMap(r => r.monthlyBreakdown.filter((_, i) => i === curMonthIdx));
  const bottomTotalSales = curLocData.reduce((s, m) => s + m.totalSales, 0);
  const bottomCollected = curLocData.reduce((s, m) => s + m.collected, 0);
  const bottomAdvance = curLocData.reduce((s, m) => s + m.advance, 0);
  const bottomTotalIncome = curLocData.reduce((s, m) => s + m.totalIncome, 0);
  const bottomReceivables = curLocData.reduce((s, m) => s + m.receivables, 0);

  const getStatusClass = (status: string, isAdvance: boolean) => {
    if (isAdvance) return 'text-lime-600 font-semibold';
    if (status === 'paid') return 'text-green-600 font-semibold';
    if (status === 'partial') return 'text-orange-500 font-semibold';
    return 'text-red-500 font-semibold';
  };

  const getMonthCellClass = (s: string, isAdv: boolean) => {
    if (isAdv) return 'bg-lime-100 text-lime-700';
    if (s === 'paid') return 'bg-green-50 text-green-700';
    if (s === 'partial') return 'bg-orange-50 text-orange-700';
    return 'bg-red-50 text-red-500';
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">Sales</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {view === 'monthly' && (
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <button onClick={() => setView('monthly')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${view === 'monthly' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
            Monthly View
          </button>
          <button onClick={() => setView('annual')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${view === 'annual' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
            Annual View
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-900 text-white hover:bg-blue-800">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-green-500" /><span className="text-gray-600">Fully Paid</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-red-500" /><span className="text-gray-600">Incomplete / Unpaid</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-yellow-400" /><span className="text-gray-600">Paid via Advance</span></span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search name, block, unit..." />
        <select value={locFilter} onChange={e => { setLocFilter(e.target.value); setBlockFilter(''); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Locations</option>
          {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={blockFilter} onChange={e => setBlockFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Blocks</option>
          {allBlockLetters.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <span className="text-gray-500 text-xs">Sort:</span>
        <SortGroup label="Name" ascKey="name-asc" descKey="name-desc" current={sortKey} onSelect={setSortKey} />
        <SortGroup label="Date" ascKey="date-newest" descKey="date-oldest" current={sortKey} onSelect={setSortKey} />
        <SortGroup label="Block" ascKey="block-asc" descKey="block-desc" current={sortKey} onSelect={setSortKey} />
        <SortGroup label="Unit" ascKey="unit-asc" descKey="unit-desc" current={sortKey} onSelect={setSortKey} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100" ref={printRef}>
        <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-blue-900/40 [&::-webkit-scrollbar-thumb]:rounded-full">
          {view === 'monthly' ? (
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[21%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[25%]" />
              </colgroup>
              <thead>
                <tr className="bg-blue-900 text-white text-xs uppercase">
                  <th className="px-3 py-3 text-left rounded-tl-xl">Date Joined</th>
                  <th className="px-3 py-3 text-left">Name</th>
                  <th className="px-3 py-3 text-left">Block</th>
                  <th className="px-3 py-3 text-left">Unit</th>
                  <th className="px-3 py-3 text-right">Rent/mo</th>
                  <th className="px-3 py-3 text-right">Adv. Bal</th>
                  <th className="px-3 py-3 text-center">Method</th>
                  <th className="px-3 py-3 text-right">Paid</th>
                  <th className="px-3 py-3 text-center rounded-tr-xl">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expandedRows.map((row, idx) => {
                  const { lessee: l, blockName, units } = row;
                  const ms = getLesseeMonthStatus(data.payments, l, currentMonthStr);
                  const pays = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === currentMonthStr && p.type !== 'deposit_advance');
                  const methods = pays.length > 0
                    ? [...new Set(pays.map(p => PAYMENT_METHOD_LABEL[p.method]))].join(', ')
                    : ms.isAdvance ? 'Advance' : '—';
                  const hasPay = pays.length > 0;
                  const hasAdvDepositThisMonth = data.payments.some(p => p.lesseeId === l.id && p.forMonth === currentMonthStr && p.type === 'deposit_advance');
                  const advBalance = getStoredAdvanceBalance(data.payments, l.id);
                  const depositPayments = data.payments.filter(p => p.lesseeId === l.id && p.type === 'deposit_advance');
                  const canPayWithAdv = advBalance >= l.monthlyRent && ms.status !== 'paid' && !ms.isAdvance;
                  const canPayThisMonth = canPayForMonth(l, currentMonthStr);
                  return (
                    <tr key={`${l.id}-${blockName}`} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{l.startDate}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{l.name}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{blockName ? blockName : '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{units.join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 text-sm">{fmt(getLesseeRentForMonth(data.payments, l, currentMonthStr))}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={advBalance > 0 ? 'text-yellow-600 font-semibold text-xs' : 'text-gray-300 text-xs'}>
                          {advBalance > 0 ? fmt(advBalance) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500 text-xs">{methods}</td>
                      <td className={`px-3 py-2.5 text-right ${hasAdvDepositThisMonth ? 'text-yellow-600 font-semibold' : getStatusClass(ms.status, ms.isAdvance)}`}>
                        {fmt(getMonthlyPaidForDisplay(l, currentMonthStr))}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {(() => {
                            if (!canPayThisMonth) {
                              return <span className="text-xs text-gray-400">Not active</span>;
                            }
                            if (hasAdvDepositThisMonth) {
                              return (
                                <button onClick={() => clearMonthDeposit(l, currentMonthStr)}
                                  className="px-2 py-1 rounded text-xs font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200">
                                  Clear
                                </button>
                              );
                            }
                            if (ms.isAdvance) {
                              return (
                                <button onClick={() => clearMonthPayments(l, currentMonthStr)}
                                  className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">
                                  Clear
                                </button>
                              );
                            }
                            if (ms.status === 'paid' && hasPay) {
                              return (
                                <>
                                  {hasAdvDepositThisMonth ? (
                                    <button onClick={() => clearMonthPayments(l, currentMonthStr)}
                                      className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">
                                      Clear
                                    </button>
                                  ) : (
                                    <>
                                      <button onClick={() => clearMonthPayments(l, currentMonthStr)}
                                        className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">
                                        Clear
                                      </button>
                                      <button onClick={() => undoLastPayment(l, currentMonthStr)}
                                        className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500 hover:bg-orange-100 hover:text-orange-600">
                                        Undo
                                      </button>
                                    </>
                                  )}
                                </>
                              );
                            }
                            if (ms.status === 'partial') {
                              return (
                                <>
                                  <button onClick={() => openPayModal(l, 'full')}
                                    className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200">
                                    Full
                                  </button>
                                  <button onClick={() => openPayModal(l, 'partial')}
                                    className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">
                                    Partial
                                  </button>
                                  <button onClick={() => clearMonthPayments(l, currentMonthStr)}
                                    className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">
                                    Clear
                                  </button>
                                </>
                              );
                            }
                            // Unpaid
                            return (
                              <>
                                <button onClick={() => openPayModal(l, 'full')}
                                  className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200">
                                  Full
                                </button>
                                <button onClick={() => openPayModal(l, 'partial')}
                                  className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">
                                  Partial
                                </button>
                                {canPayWithAdv && (
                                  <button onClick={() => setAdvMethodModal({ lessee: l, forMonth: currentMonthStr })}
                                    className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200">
                                    Adv
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400">No lessees found.</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <>
            <div className="overflow-x-scroll overflow-y-auto max-h-[56vh] pt-4 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-blue-900/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:w-1.5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2 px-6">Lessee Payments</h3>
              <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-blue-900 text-white text-xs uppercase">
                  <th className="px-3 py-3 text-left sticky left-0 bg-blue-900 z-30 rounded-tl-xl">Name</th>
                  <th className="px-3 py-3 text-left">Block</th>
                  <th className="px-3 py-3 text-left">Unit</th>
                  {MONTHS.map((m) => <th key={m} className="px-2 py-3 text-center min-w-[72px]">{m}</th>)}
                  <th className="px-3 py-3 text-right min-w-[72px]">Total</th>
                  <th className="px-3 py-3 text-right rounded-tr-xl min-w-[72px]">AP</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                // Pre-compute months paid from the stored advance balance.
                const implicitCoverage = new Map<string, Set<string>>();
                filtered.forEach(l => {
                  const covered = new Set<string>();
                  data.payments.forEach(p => {
                    if (p.lesseeId === l.id && p.type === 'advance_used') {
                      covered.add(p.forMonth);
                    }
                  });
                  implicitCoverage.set(l.id, covered);
                });
                return expandedRows.map((row, idx) => {
                  const { lessee: l, blockName, units } = row;
                  return (
                    <tr key={`${l.id}-${blockName}`} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-3 py-2.5 font-medium text-gray-800 sticky left-0 bg-inherit z-10 whitespace-nowrap">{l.name}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs whitespace-nowrap">{blockName ? blockName : '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs whitespace-nowrap">{units.join(', ') || '—'}</td>
                      {MONTHS.map((_, mi) => {
                        const mStr = `${year}-${String(mi + 1).padStart(2, '0')}`;
                        const ms = getLesseeMonthStatus(data.payments, l, mStr);
                        const monthPaid = getMonthlyPaidForDisplay(l, mStr);
                        const monthAdvDep = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === mStr && p.type === 'deposit_advance').reduce((s, p) => s + p.amount, 0);
                        const isImplicit = implicitCoverage.get(l.id)?.has(mStr) ?? false;
                        const canPayThisMonth = canPayForMonth(l, mStr);
                        const cellClass = monthAdvDep > 0
                          ? monthPaid >= getLesseeRentForMonth(data.payments, l, mStr)
                            ? 'bg-green-100 text-green-700'
                            : monthPaid > 0
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-400'
                          : ms.isAdvance
                            ? 'bg-yellow-100 text-yellow-700'
                            : ms.status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : isImplicit
                                ? 'bg-yellow-100 text-yellow-700'
                                : ms.status === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-400';
                        return (
                          <td key={mi} className={`px-1 py-2 ${canPayThisMonth ? 'cursor-pointer' : 'cursor-default'}`} onClick={() => canPayThisMonth && setCellPayModal({ lessee: l, forMonth: mStr })}>
                            <span className={`inline-block w-full text-center py-0.5 rounded text-xs ${cellClass}`}>
                              {!canPayThisMonth ? <span className="text-gray-400">—</span> : monthPaid > 0 ? fmt(monthPaid) : <span className="text-gray-300">—</span>}
                            </span>
                          </td>
                        );
                      })}
                      {(() => {
                        const yearTotal = data.payments
                          .filter(p => p.lesseeId === l.id && p.forMonth.startsWith(String(year)) && p.type !== 'deposit_advance')
                          .reduce((s, p) => s + p.amount, 0);
                        const yearAP = MONTHS.reduce((s, _, mi) => {
                          const mStr = `${year}-${String(mi + 1).padStart(2, '0')}`;
                          const isFuture = new Date(year, mi, 1) > today;
                          if (isFuture) return s;
                          const paid = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === mStr && p.type !== 'deposit_advance').reduce((ss, p) => ss + p.amount, 0);
                          return s + Math.max(0, getLesseeRentForMonth(data.payments, l, mStr) - paid);
                        }, 0);
                        return (
                          <>
                            <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-700 whitespace-nowrap">{yearTotal > 0 ? fmt(yearTotal) : '—'}</td>
                            <td className="px-3 py-2.5 text-right text-xs font-semibold text-red-600 whitespace-nowrap">{yearAP > 0 ? fmt(yearAP) : <span className="text-gray-300">—</span>}</td>
                          </>
                        );
                      })()}
                    </tr>
                  );
                });
              })()}
              </tbody>
                </table>
              </div>

            <div className="mt-6 bg-gray-50 px-6 pb-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Monthly Summary</h3>
              {summaryByLoc.map(({ loc, monthlyBreakdown }) => (
                <div key={loc.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <p className="px-3 py-2 text-xs font-semibold text-gray-600 uppercase bg-gray-50 border-b border-gray-200">{loc.name}</p>
                  <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-blue-900/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-blue-900 text-white">
                          <th className="px-3 py-1.5 text-left">Row</th>
                          {MONTHS.map(m => <th key={m} className="px-2 py-1.5 text-center min-w-[56px]">{m}</th>)}
                          <th className="px-3 py-1.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-blue-50/30 border-b border-gray-100">
                          <td className="px-3 py-1.5 text-blue-700 whitespace-nowrap">Total Sales</td>
                          {monthlyBreakdown.map(({ label, totalSales }) => (
                            <td key={label} className="px-2 py-1.5 text-center text-blue-700 border-r border-blue-100">{totalSales > 0 ? fmt(totalSales) : '—'}</td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-semibold text-blue-700">{fmt(monthlyBreakdown.reduce((s, m) => s + m.totalSales, 0))}</td>
                        </tr>
                        <tr className="border-b border-gray-100 bg-yellow-50/40">
                          <td className="px-3 py-1.5 text-yellow-700 whitespace-nowrap">Advance Deposit</td>
                          {monthlyBreakdown.map(({ label, advance }) => (
                            <td key={label} className="px-2 py-1.5 text-center text-yellow-700 border-r border-yellow-100">{advance > 0 ? fmt(advance) : <span className="text-gray-300">—</span>}</td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-semibold text-yellow-700">{monthlyBreakdown.some(m => m.advance > 0) ? fmt(monthlyBreakdown.reduce((s, m) => s + m.advance, 0)) : '—'}</td>
                        </tr>
                        <tr className="border-b border-gray-100 bg-purple-50/30">
                          <td className="px-3 py-1.5 text-purple-700 whitespace-nowrap font-semibold">Total Income</td>
                          {monthlyBreakdown.map(({ label, totalIncome }) => (
                            <td key={label} className="px-2 py-1.5 text-center text-purple-700 border-r border-purple-100 font-semibold">{totalIncome > 0 ? fmt(totalIncome) : '—'}</td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-semibold text-purple-700">{fmt(monthlyBreakdown.reduce((s, m) => s + m.totalIncome, 0))}</td>
                        </tr>
                        <tr className="border-b border-gray-100 bg-emerald-50/30">
                          <td className="px-3 py-1.5 text-emerald-700 whitespace-nowrap font-medium">Monthly Collections</td>
                          {monthlyBreakdown.map(({ label, collected }) => (
                            <td key={label} className="px-2 py-1.5 text-center text-emerald-700 border-r border-emerald-100">{collected > 0 ? fmt(collected) : <span className="text-gray-300">—</span>}</td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">{fmt(monthlyBreakdown.reduce((s, m) => s + m.collected, 0))}</td>
                        </tr>
                        <tr className="bg-red-50/30">
                          <td className="px-3 py-1.5 text-red-600 whitespace-nowrap">Receivables</td>
                          {monthlyBreakdown.map(({ label, receivables, isFuture }) => (
                            <td key={label} className={`px-2 py-1.5 text-center border-r border-red-100 ${receivables < 0 ? 'text-green-600' : 'text-red-600'}`}>{isFuture ? <span className="text-gray-300">—</span> : receivables !== 0 ? fmtReceivable(receivables) : <span className="text-gray-300">—</span>}</td>
                          ))}
                          <td className={`px-3 py-1.5 text-right font-semibold ${monthlyBreakdown.reduce((s, m) => s + m.receivables, 0) < 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtReceivable(monthlyBreakdown.reduce((s, m) => s + m.receivables, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>

        {/* Summary — monthly view only */}
        {view === 'monthly' && (
          <>
            {/* 5 stat cards — current month */}
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-blue-500 mb-0.5">Total Sales</p>
                  <p className="font-bold text-blue-700 text-sm">{fmt(bottomTotalSales)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-amber-500 mb-0.5">Advance Deposit</p>
                  <p className="font-bold text-amber-700 text-sm">{fmt(bottomAdvance)}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-purple-500 mb-0.5">Total Income</p>
                  <p className="font-bold text-purple-700 text-sm">{fmt(bottomTotalIncome)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-emerald-500 mb-0.5">Monthly Collections</p>
                  <p className="font-bold text-emerald-700 text-sm">{fmt(bottomCollected)}</p>
                </div>
                <div className="bg-rose-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-rose-500 mb-0.5">Receivables</p>
                  <p className={`font-bold text-sm ${bottomReceivables < 0 ? 'text-green-700' : 'text-rose-700'}`}>{fmtReceivable(bottomReceivables)}</p>
                </div>
              </div>
            </div>

            {/* monthly per-location small tables removed here; full month-by-month tables are shown in Annual view */}
          </>
        )}
      </div>

      {payModal && (
        <PaymentModal lessee={payModal.lessee} forMonth={currentMonthStr} mode={payModal.mode}
          alreadyPaid={payModal.alreadyPaid} advBalance={getStoredAdvanceBalance(data.payments, payModal.lessee.id)}
          onConfirm={handlePayConfirm} onCancel={() => setPayModal(null)} />
      )}
      {cellPayModal && (
        <CellPayModal
          lessee={cellPayModal.lessee}
          forMonth={cellPayModal.forMonth}
          data={data}
          onConfirm={handleCellPayConfirm}
          onClear={handleCellClear}
          onCancel={() => setCellPayModal(null)}
        />
      )}
      {advMethodModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs">
            <div className="bg-yellow-600 px-5 py-3 rounded-t-xl">
              <h3 className="text-white font-semibold text-sm">Pay with Advance Balance</h3>
              <p className="text-yellow-100 text-xs mt-0.5">{advMethodModal.lessee.name} — {advMethodModal.forMonth}</p>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-600">Select payment method for advance balance record:</p>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(m => (
                  <button key={m} type="button"
                    onClick={() => { recordAdvanceUsed(advMethodModal.lessee, advMethodModal.forMonth, m); setAdvMethodModal(null); }}
                    className="py-2 rounded-lg text-xs border border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors">
                    {PAYMENT_METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              <button onClick={() => setAdvMethodModal(null)} className="w-full py-2 border border-gray-300 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {printCallback && (
        <PrintTitleModal
          defaultTitle={view === 'monthly' ? `Sales Report — ${MONTHS[parseInt(currentMonthStr.split('-')[1])-1]} ${currentMonthStr.split('-')[0]}` : `Annual Sales Report — ${year}`}
          onConfirm={t => { printCallback(t); setPrintCallback(null); }}
          onCancel={() => setPrintCallback(null)}
        />
      )}
      {showPrintFormat && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
              <h3 className="text-white font-semibold">Choose Print Format</h3>
              <p className="text-blue-200 text-sm mt-0.5">Annual Report — {year}</p>
            </div>
            <div className="p-6 space-y-3">
              <button
                onClick={() => { setShowPrintFormat(false); setPrintCallback(() => (t: string) => doPrintByMonth(t)); }}
                className="w-full border border-blue-200 rounded-xl p-4 text-left hover:bg-blue-50 transition-colors group">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-blue-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">Format A — By Month</p>
                    <p className="text-xs text-gray-500 mt-0.5">Jan → Dec, each month lists all lessees with payments, followed by monthly summary. Grand total on final page.</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setShowPrintFormat(false); setPrintCallback(() => (t: string) => doPrintByName(t)); }}
                className="w-full border border-purple-200 rounded-xl p-4 text-left hover:bg-purple-50 transition-colors group">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-purple-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">Format B — By Name</p>
                    <p className="text-xs text-gray-500 mt-0.5">Each lessee gets their own section showing Jan–Dec payments, total paid, and AP. Grand total at the bottom.</p>
                  </div>
                </div>
              </button>
              <button onClick={() => setShowPrintFormat(false)} className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
