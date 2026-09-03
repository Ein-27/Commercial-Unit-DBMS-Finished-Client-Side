import { useState, useRef, useEffect, type CSSProperties } from 'react';
import type { AppData, Block, Unit, Lessee, PaymentMethod } from '../data/types';
import { generateId, createDepositPayments, getStoredAdvanceBalance, PAYMENT_METHOD_LABEL } from '../data/store';
import { enterToNext, generatePaymentSOA } from '../utils';
import { useConfirm } from './ConfirmDialog';

const fmt = (n: number) => `₱${n.toLocaleString()}`;
const METHODS: PaymentMethod[] = ['cash', 'check', 'digital'];

const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function MdySelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const currentYear = new Date().getFullYear();
  const parts = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').map(Number) : [currentYear, 1, 1];
  const selYear = parts[0], selMonth = parts[1], selDay = parts[2];
  const upperYear = Math.max(currentYear, selYear);
  const years = Array.from({ length: upperYear - 2022 + 1 }, (_, i) => 2022 + i);
  const daysInMonth = new Date(selYear, selMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const clamp = (y: number, m: number, d: number) => Math.min(d, new Date(y, m, 0).getDate());
  const update = (y: number, m: number, d: number) =>
    onChange(`${y}-${String(m).padStart(2,'0')}-${String(clamp(y,m,d)).padStart(2,'0')}`);

  // Simple custom dropdown to force opening downward and cap height
  const CustomSelect = ({ options, value, onChange, className, labelFn }: {
    options: Array<{ label: string; value: any }>;
    value: any;
    onChange: (v: any) => void;
    className?: string;
    labelFn?: (o: { label: string; value: any }) => string;
  }) => {
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
    const ref = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
      const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    useEffect(() => {
      if (!open) return;

      const updatePosition = () => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuStyle({
          position: 'fixed',
          left: `${rect.left}px`,
          top: `${rect.bottom + 4}px`,
          minWidth: `${rect.width}px`,
          zIndex: 9999,
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }, [open]);

    const selected = options.find(o => o.value === value) ?? options[0];
    const selectedLabel = labelFn ? labelFn(selected) : selected.label;
    const displayLabel = String(selectedLabel).replace(/^\d{2}\s*[–-]\s*/, '');

    return (
      <div ref={ref} className={`relative overflow-visible ${className ?? ''}`}>
        <button ref={buttonRef} type="button" onClick={() => setOpen(s => !s)}
          className="w-full text-left flex items-center justify-between border border-gray-300 rounded-lg px-1 py-1 bg-white text-sm">
          <span className="truncate">{displayLabel}</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400 ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div style={menuStyle} className="bg-white border border-gray-200 rounded shadow-2xl max-h-44 overflow-y-auto whitespace-nowrap">
            {options.map(o => (
              <div key={String(o.value)} onClick={() => { onChange(o.value); setOpen(false); }}
                className="px-2 py-2 hover:bg-blue-50 cursor-pointer text-sm">{labelFn ? labelFn(o) : o.label}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${className ?? ''}`}>
      <div className="flex items-center">
        <div className="w-20 sm:w-24 md:w-28">
          <CustomSelect
            options={MONTH_NAMES_FULL.map((m, i) => ({ label: `${String(i + 1).padStart(2, '0')} – ${m}`, value: i + 1 }))}
            value={selMonth}
            onChange={(v: number) => update(selYear, Number(v), selDay)}
            labelFn={o => String(o.label)}
          />
        </div>
        <div className="px-1 text-gray-400 select-none">/</div>
        <div className="w-20 sm:w-24 md:w-28">
          <CustomSelect
            options={days.map(d => ({ label: String(d), value: d }))}
            value={selDay}
            onChange={(v: number) => update(selYear, selMonth, Number(v))}
          />
        </div>
        <div className="px-1 text-gray-400 select-none">/</div>
        <div className="w-20 sm:w-24 md:w-28">
          <CustomSelect
            options={years.map(y => ({ label: String(y), value: y }))}
            value={selYear}
            onChange={(v: number) => update(Number(v), selMonth, selDay)}
          />
        </div>
      </div>
    </div>
  );
}

interface Props {
  data: AppData;
  onUpdateData: (data: AppData) => void;
}

/** Build a map of all occupied unit IDs → lessee, including multi-unit lessees. */
function buildOccupiedMap(data: AppData): Map<string, Lessee> {
  const map = new Map<string, Lessee>();
  data.lessees.filter(l => l.isActive).forEach(l => {
    if (l.unitId) map.set(l.unitId, l);
    l.unitIds?.forEach(uid => map.set(uid, l));
  });
  return map;
}

// ─── New Lessee Modal ─────────────────────────────────────────────────────────
interface NewLesseeModalProps {
  unit: Unit; block: Block; locationId: string; data: AppData;
  onConfirm: (lessee: Lessee, extraPayments: import('../data/types').Payment[]) => void;
  onCancel: () => void;
}

function normalizeLesseeUnitIds(unitIds: string[], units: Unit[]) {
  const byNumber = new Map(units.map(u => [u.id, parseInt(u.number, 10) || 0]));
  const ordered = [...new Set(unitIds.filter(Boolean))].sort((a, b) => (byNumber.get(a) ?? 0) - (byNumber.get(b) ?? 0));
  return {
    unitId: ordered[0],
    unitIds: ordered.length > 1 ? ordered.slice(1) : undefined,
  };
}

function NewLesseeModal({ unit, block, locationId, data, onConfirm, onCancel }: NewLesseeModalProps) {
  const [name, setName] = useState('');
  const [rent, setRent] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [hasDeposit, setHasDeposit] = useState(false);
  const [depositIsFull, setDepositIsFull] = useState(true);
  const [depositPartialAmt, setDepositPartialAmt] = useState('');
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash');
  const [err, setErr] = useState('');

  const rentVal = parseFloat(rent) || 0;
  const fullDepositAmt = rentVal * 3; // 1 month deposit + 2 months advance stored
  const depositPaid = depositIsFull ? fullDepositAmt : (parseFloat(depositPartialAmt) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Enter lessee name.'); return; }
    if (!rent || rentVal <= 0) { setErr('Enter valid monthly rent.'); return; }
    if (hasDeposit && !depositIsFull) {
      const p = parseFloat(depositPartialAmt);
      if (isNaN(p) || p <= 0) { setErr('Enter partial deposit amount.'); return; }
      if (p > fullDepositAmt) { setErr(`Partial cannot exceed ${fmt(fullDepositAmt)}.`); return; }
    }

    const startMonth = startDate.slice(0, 7);

    const newLessee: Lessee = {
      id: generateId(), name: name.trim(),
      unitId: unit.id, blockId: block.id, locationId,
      monthlyRent: rentVal, startDate, isActive: true,
      hasDepositAdvance: hasDeposit, depositAmount: hasDeposit ? fullDepositAmt : undefined,
    };

    const extraPayments = hasDeposit
      ? createDepositPayments(newLessee.id, rentVal, depositPaid, depositMethod, startMonth, data.payments, false)
        .map(payment => ({ ...payment, notes: 'new_lessee_advance_deposit' }))
      : [];

    onConfirm(newLessee, extraPayments);
  };

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-4">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
          <h3 className="text-white font-semibold">New Lessee</h3>
          <p className="text-blue-200 text-sm">{block.name}, Unit {unit.number}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} className={inp} placeholder="Lessee full name" autoFocus onKeyDown={enterToNext} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (₱) *</label>
            <input type="number" value={rent} onChange={e => { setRent(e.target.value); setErr(''); }}
              className={inp} placeholder="e.g. 8000" min="1" onWheel={e => (e.target as HTMLInputElement).blur()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <MdySelect value={startDate} onChange={setStartDate} />
          </div>

          {/* Deposit & Advance */}
          <div className={`border rounded-xl p-4 space-y-3 transition-colors ${hasDeposit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={hasDeposit} onChange={e => { setHasDeposit(e.target.checked); setErr(''); }} className="w-4 h-4 accent-blue-900" />
              <span className="text-sm font-medium text-gray-700">Advance Deposit</span>
            </label>
            {hasDeposit && (
              <div className="space-y-3 pl-7">
                <div className="text-xs text-gray-500">Amount: <strong className="text-blue-700">{fmt(fullDepositAmt)}</strong> (1 month deposit + 2 months advance)</div>
                <div className="grid grid-cols-2 gap-2">
                  {[true, false].map(isFull => (
                    <button key={String(isFull)} type="button" onClick={() => { setDepositIsFull(isFull); setDepositPartialAmt(''); }}
                      className={`py-1.5 rounded-lg text-xs border transition-colors ${depositIsFull === isFull ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      {isFull ? `Full (${fmt(fullDepositAmt)})` : 'Partial Amount'}
                    </button>
                  ))}
                </div>
                {!depositIsFull && (
                  <input type="number" value={depositPartialAmt} onChange={e => { setDepositPartialAmt(e.target.value); setErr(''); }}
                    className={inp} placeholder={`Max: ${fmt(fullDepositAmt)}`} min="1" max={fullDepositAmt}
                    onWheel={e => (e.target as HTMLInputElement).blur()} />
                )}
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map(m => (
                    <button key={m} type="button" onClick={() => setDepositMethod(m)}
                      className={`py-1.5 px-1 rounded-lg text-xs border transition-colors ${depositMethod === m ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
                {/* 'Use advance to cover current month?' intentionally removed */}
              </div>
            )}
          </div>

          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Add Lessee</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Multi-Unit Assignment Modal ──────────────────────────────────────────────
interface MultiUnitModalProps {
  data: AppData;
  onConfirm: (lessee: Lessee, extraPayments: import('../data/types').Payment[]) => void;
  onCancel: () => void;
}
function MultiUnitModal({ data, onConfirm, onCancel }: MultiUnitModalProps) {
  const [mode, setMode] = useState<'new' | 'returning'>('new');
  const [name, setName] = useState('');
  const [rent, setRent] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [returnSearch, setReturnSearch] = useState('');
  const [selectedReturning, setSelectedReturning] = useState<Lessee | null>(null);
  const [returnRent, setReturnRent] = useState('');
  const [locId, setLocId] = useState(data.locations[0]?.id ?? '');
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [hasDeposit, setHasDeposit] = useState(false);
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash');
  const [err, setErr] = useState('');

  const occupiedMap = buildOccupiedMap(data);
  const isReturning = mode === 'returning';
  const rentVal = isReturning ? parseFloat(returnRent) || 0 : parseFloat(rent) || 0;
  const fullDepositAmt = rentVal * 3;

  const toggleUnit = (uid: string) => {
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
    setErr('');
  };

  const inactiveLessees = data.lessees.filter(l => !l.isActive);
  const filteredReturning = inactiveLessees.filter(l => {
    const q = returnSearch.toLowerCase();
    return !q || l.name.toLowerCase().includes(q) || (l.soa ?? '').includes(q);
  });

  const locBlocks = data.blocks.filter(b => b.locationId === locId).sort((a, b) => a.name.localeCompare(b.name));

  const handleConfirm = () => {
    if (isReturning && !selectedReturning) { setErr('Select a returning lessee.'); return; }
    if (!isReturning && !name.trim()) { setErr('Enter lessee name.'); return; }
    if (rentVal <= 0) { setErr('Enter monthly rent.'); return; }
    // Units are optional now; allow creating a lessee with no units selected

    const conflicts: string[] = [];
    const excludeId = isReturning ? selectedReturning!.id : null;
    selectedUnitIds.forEach(uid => {
      const existing = occupiedMap.get(uid);
      if (existing && existing.id !== excludeId)
        conflicts.push(`Unit ${data.units.find(u => u.id === uid)?.number ?? uid} (${existing.name})`);
    });
    if (conflicts.length > 0) { setErr(`Already occupied: ${conflicts.join(', ')}. Remove them first.`); return; }

    const ids = [...selectedUnitIds];
    const unitAssignment = normalizeLesseeUnitIds(ids, data.units);
    const primaryUnitId = unitAssignment.unitId ?? '';
    const primaryUnit = primaryUnitId ? data.units.find(u => u.id === primaryUnitId) : undefined;
    const primaryBlock = primaryUnit ? data.blocks.find(b => b.id === primaryUnit.blockId) : undefined;
    const sd = isReturning ? new Date().toISOString().split('T')[0] : startDate;
    const startMonth = sd.slice(0, 7);

    let newLessee: Lessee;
    if (isReturning && selectedReturning) {
      newLessee = {
        ...selectedReturning,
        ...unitAssignment,
        blockId: primaryBlock?.id ?? '',
        locationId: locId,
        monthlyRent: rentVal,
        startDate: sd, endDate: undefined, isActive: true,
        hasDepositAdvance: hasDeposit,
        depositAmount: hasDeposit ? fullDepositAmt : undefined,
      };
    } else {
      newLessee = {
        id: generateId(), name: name.trim(),
        unitId: primaryUnitId || '',
        unitIds: unitAssignment.unitIds && unitAssignment.unitIds.length > 0 ? unitAssignment.unitIds : undefined,
        blockId: primaryBlock?.id ?? '',
        locationId: locId,
        monthlyRent: rentVal, startDate: sd, isActive: true,
        hasDepositAdvance: hasDeposit, depositAmount: hasDeposit ? fullDepositAmt : undefined,
      };
    }

    const extraPayments = hasDeposit
      ? createDepositPayments(isReturning ? selectedReturning!.id : newLessee.id, rentVal, fullDepositAmt, depositMethod, startMonth, data.payments)
      : [];

    onConfirm(newLessee, extraPayments);
  };

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
          <h3 className="text-white font-semibold">Assign Multiple Units</h3>
          <p className="text-blue-200 text-sm">One lessee — multiple units — one monthly payment</p>
        </div>
        <div className="p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            <button onClick={() => { setMode('new'); setSelectedReturning(null); setErr(''); }}
              className={`flex-1 py-2 text-sm transition-colors ${mode === 'new' ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              New Lessee
            </button>
            <button onClick={() => { setMode('returning'); setErr(''); }}
              className={`flex-1 py-2 text-sm border-l border-gray-300 transition-colors ${mode === 'returning' ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Returning Lessee
            </button>
          </div>

          {mode === 'new' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} className={inp} placeholder="Lessee full name" autoFocus onKeyDown={enterToNext} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Monthly Rent (₱) *</label>
                <input type="number" value={rent} onChange={e => { setRent(e.target.value); setErr(''); }}
                  className={inp} placeholder="e.g. 64000" min="1" onWheel={e => (e.target as HTMLInputElement).blur()} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <MdySelect value={startDate} onChange={setStartDate} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input value={returnSearch} onChange={e => setReturnSearch(e.target.value)}
                className={inp} placeholder="Search former lessees..." autoFocus />
              <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                {filteredReturning.map(l => (
                  <button key={l.id} onClick={() => { setSelectedReturning(l); setReturnRent(String(l.monthlyRent)); setErr(''); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedReturning?.id === l.id ? 'bg-blue-900 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                    <div className="font-medium">{l.name}</div>
                    <div className={`text-xs ${selectedReturning?.id === l.id ? 'text-blue-200' : 'text-gray-400'}`}>
                      {l.soa ? `Ref No.: ${l.soa} — ` : ''}prev. {fmt(l.monthlyRent)}/mo
                    </div>
                  </button>
                ))}
                {filteredReturning.length === 0 && <p className="text-center text-gray-400 py-3 text-sm">No inactive lessees found.</p>}
              </div>
              {selectedReturning && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Monthly Rent (₱) *</label>
                  <input type="number" value={returnRent} onChange={e => { setReturnRent(e.target.value); setErr(''); }}
                    className={inp} placeholder="Enter new rent" min="1" onWheel={e => (e.target as HTMLInputElement).blur()} />
                </div>
              )}
            </div>
          )}

          {/* Location selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <select value={locId} onChange={e => { setLocId(e.target.value); setSelectedUnitIds(new Set()); }} className={inp}>
              {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Unit selection grid */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Units <span className="text-blue-600 font-normal">({selectedUnitIds.size} selected)</span>
            </label>
            <div className="max-h-56 overflow-y-auto space-y-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
              {locBlocks.map(block => {
                const blockUnits = data.units.filter(u => u.blockId === block.id).sort((a, b) => parseInt(a.number) - parseInt(b.number));
                if (blockUnits.length === 0) return null;
                return (
                  <div key={block.id}>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">{block.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {blockUnits.map(unit => {
                        const occupier = occupiedMap.get(unit.id);
                        const isOccupied = !!occupier;
                        const isSelected = selectedUnitIds.has(unit.id);
                        return (
                          <button key={unit.id} type="button"
                            onClick={() => !isOccupied && toggleUnit(unit.id)}
                            disabled={isOccupied}
                            title={isOccupied ? `Occupied by ${occupier?.name}` : `Unit ${unit.number}`}
                            className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                              isOccupied
                                ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed line-through'
                                : isSelected
                                  ? 'bg-blue-900 text-white border-blue-900'
                                  : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
                            }`}>
                            {unit.number}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {locBlocks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No blocks in this location.</p>}
            </div>
            {selectedUnitIds.size > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                Selected: {[...selectedUnitIds].map(uid => {
                  const u = data.units.find(x => x.id === uid);
                  const b = data.blocks.find(x => x.id === u?.blockId);
                  return `${b?.name} Unit ${u?.number}`;
                }).join(', ')}
              </p>
            )}
          </div>

          {/* Deposit & Advance */}
          <div className={`border rounded-xl p-3 space-y-2 transition-colors ${hasDeposit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={hasDeposit} onChange={e => setHasDeposit(e.target.checked)} className="w-4 h-4 accent-blue-900" />
              <span className="text-sm font-medium text-gray-700">Advance Deposit</span>
            </label>
            {hasDeposit && rentVal > 0 && (
              <div className="pl-7 space-y-2">
                <p className="text-xs text-gray-500">Amount: <strong className="text-blue-700">{fmt(fullDepositAmt)}</strong> (1 month deposit + 2 months advance)</p>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map(m => (
                    <button key={m} type="button" onClick={() => setDepositMethod(m)}
                      className={`py-1.5 px-1 rounded-lg text-xs border transition-colors ${depositMethod === m ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleConfirm} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Assign Units</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Change Unit Modal ────────────────────────────────────────────────────────
interface ChangeUnitModalProps {
  lessee: Lessee; data: AppData;
  onConfirm: (newUnitId: string, newBlockId: string, newLocationId: string) => void;
  onCancel: () => void;
}
function ChangeUnitModal({ lessee, data, onConfirm, onCancel }: ChangeUnitModalProps) {
  const [search, setSearch] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  const occupiedMap = buildOccupiedMap(data);
  // Exclude all units this lessee currently occupies
  const thisLesseeUnits = new Set([lessee.unitId, ...(lessee.unitIds ?? [])]);
  const vacantUnits = data.units.filter(u => !occupiedMap.has(u.id) && !thisLesseeUnits.has(u.id));

  const filtered = vacantUnits.filter(u => {
    const block = data.blocks.find(b => b.id === u.blockId);
    const loc = data.locations.find(l => l.id === block?.locationId);
    return !search || `${block?.name} Unit ${u.number} ${loc?.name}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
          <h3 className="text-white font-semibold">Change Unit</h3>
          <p className="text-blue-200 text-sm">{lessee.name}</p>
        </div>
        <div className="p-6 space-y-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search vacant units..." autoFocus />
          <div className="max-h-56 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
            {filtered.map(u => {
              const block = data.blocks.find(b => b.id === u.blockId);
              const loc = data.locations.find(l => l.id === block?.locationId);
              return (
                <button key={u.id} onClick={() => setSelectedUnitId(u.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedUnitId === u.id ? 'bg-blue-900 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                  <span className="font-medium">{block?.name}, Unit {u.number}</span>
                  <span className="text-xs ml-2 opacity-70">{loc?.name}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">No vacant units found.</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={() => {
              if (!selectedUnitId) return;
              const unit = data.units.find(u => u.id === selectedUnitId)!;
              const block = data.blocks.find(b => b.id === unit.blockId)!;
              onConfirm(selectedUnitId, block.id, block.locationId);
            }} disabled={!selectedUnitId} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800 disabled:opacity-50">
              Confirm Change
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Block / Add Unit modals ──────────────────────────────────────────────
function AddBlockModal({ onConfirm, onCancel }: { onConfirm: (n: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl"><h3 className="text-white font-semibold">Add New Block</h3></div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Block name</label>
            <input value={name} onChange={e => { setName(e.target.value.toUpperCase()); setErr(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. C or BLK1" autoFocus />
          </div>
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
            <button onClick={() => {
              if (!name.trim() || !/^[A-Z0-9 \-]+$/i.test(name.trim())) { setErr('Enter a valid block name (letters, numbers, spaces, hyphens allowed).'); return; }
              onConfirm(name.toUpperCase());
            }} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm">Add Block</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddUnitModal({ onConfirm, onCancel }: { onConfirm: (n: string) => void; onCancel: () => void }) {
  const [num, setNum] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl"><h3 className="text-white font-semibold">Add New Unit</h3></div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Unit Number</label>
            <input type="number" value={num} onChange={e => { setNum(e.target.value); setErr(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 5" min="1" autoFocus />
          </div>
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
            <button onClick={() => {
              if (!num.trim() || isNaN(parseInt(num))) { setErr('Enter a unit number.'); return; }
              onConfirm(num.trim());
            }} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm">Add Unit</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Returning Lessee Modal ───────────────────────────────────────────────────
interface ReturningLesseeModalProps {
  unit: Unit; block: Block; locationId: string; data: AppData;
  onConfirm: (lessee: Lessee, extraPayments: import('../data/types').Payment[]) => void;
  onCancel: () => void;
}
function ReturningLesseeModal({ unit, block, locationId, data, onConfirm, onCancel }: ReturningLesseeModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Lessee | null>(null);
  const [newRent, setNewRent] = useState('');
  const [hasDeposit, setHasDeposit] = useState(false);
  const [advanceType, setAdvanceType] = useState<'deposit' | 'useStored'>('deposit');
  const [useAdvForMonth, setUseAdvForMonth] = useState(false);
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash');
  const [err, setErr] = useState('');

  const inactiveLessees = data.lessees.filter(l => !l.isActive);
  const filtered = inactiveLessees.filter(l => {
    const q = search.toLowerCase();
    return !q || l.name.toLowerCase().includes(q) || (l.soa ?? '').includes(q);
  });

  const rentVal = parseFloat(newRent) || 0;
  const fullDepositAmt = rentVal * 3; // 1 month deposit + 2 months advance
  const startDate = new Date().toISOString().split('T')[0];

  const handleConfirm = () => {
    if (!selected) return;
    if (!newRent || rentVal <= 0) { setErr('Enter new monthly rent.'); return; }

    let extraPayments: import('../data/types').Payment[] = [];
    if (hasDeposit) {
      if (advanceType === 'deposit') {
        extraPayments = createDepositPayments(selected.id, rentVal, fullDepositAmt, depositMethod, startDate.slice(0, 7), data.payments, useAdvForMonth);
      } else {
        const storedBalance = getStoredAdvanceBalance(data.payments, selected.id);
        if (storedBalance <= 0) {
          setErr('No stored advance balance available to use.');
          return;
        }
        const soa = generatePaymentSOA(data.payments);
        extraPayments = [{
          id: generateId(),
          lesseeId: selected.id,
          soa,
          amount: rentVal,
          totalDue: rentVal,
          date: startDate,
          method: depositMethod,
          type: 'advance_used',
          forMonth: startDate.slice(0, 7),
          isComplete: true,
        }];
      }
    }

    const reinstated: Lessee = {
      ...selected, unitId: unit.id, unitIds: undefined,
      blockId: block.id, locationId, isActive: true,
      endDate: undefined, startDate, monthlyRent: rentVal,
      hasDepositAdvance: advanceType === 'deposit' ? true : selected.hasDepositAdvance,
      depositAmount: advanceType === 'deposit' ? fullDepositAmt : selected.depositAmount,
    };
    onConfirm(reinstated, extraPayments);
  };

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-4">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
          <h3 className="text-white font-semibold">Returning Lessee</h3>
          <p className="text-blue-200 text-sm">Select a former lessee to reinstate</p>
        </div>
        <div className="p-6 space-y-4">
          <input value={search} onChange={e => setSearch(e.target.value)} className={inp} placeholder="Search former lessees..." autoFocus />
          <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
            {filtered.map(l => (
              <button key={l.id} onClick={() => { setSelected(l); setNewRent(String(l.monthlyRent)); setErr(''); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selected?.id === l.id ? 'bg-blue-900 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                <div className="font-medium">{l.name}</div>
                <div className={`text-xs ${selected?.id === l.id ? 'text-blue-200' : 'text-gray-400'}`}>
                  {l.soa ? `SOA: ${l.soa} — ` : ''}prev. {fmt(l.monthlyRent)}/mo
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">No inactive lessees found.</p>}
          </div>

          {selected && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Monthly Rent (₱)</label>
                <input type="number" value={newRent} onChange={e => { setNewRent(e.target.value); setErr(''); }}
                  className={inp} placeholder="Enter new monthly rent" min="1" onWheel={e => (e.target as HTMLInputElement).blur()} />
              </div>
              <div className={`border rounded-xl p-3 transition-colors ${hasDeposit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={hasDeposit} onChange={e => {
                    setHasDeposit(e.target.checked);
                    if (!e.target.checked) {
                      setAdvanceType('deposit');
                      setUseAdvForMonth(false);
                    }
                  }} className="w-4 h-4 accent-blue-900" />
                  <span className="text-sm font-medium text-gray-700">Advance Deposit</span>
                </label>
                {hasDeposit && rentVal > 0 && (
                  <div className="pl-7 mt-2 space-y-3">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">Advance type</label>
                      <div className="grid gap-2 text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="advanceType" value="deposit" checked={advanceType === 'deposit'} onChange={() => setAdvanceType('deposit')} className="w-4 h-4 accent-blue-900" />
                          <span>Adding to stored balance</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="advanceType" value="useStored" checked={advanceType === 'useStored'} onChange={() => {
                            setAdvanceType('useStored');
                            setUseAdvForMonth(false);
                          }} className="w-4 h-4 accent-blue-900" />
                          <span>Using stored advance</span>
                        </label>
                      </div>
                    </div>
                    {advanceType === 'deposit' ? (
                      <>
                        <p className="text-xs text-gray-500">Total: <strong className="text-blue-700">{fmt(fullDepositAmt)}</strong> (1 month deposit + 2 months advance)</p>
                        <div className="grid grid-cols-3 gap-2">
                          {METHODS.map(m => (
                            <button key={m} type="button" onClick={() => setDepositMethod(m)}
                              className={`py-1.5 px-1 rounded-lg text-xs border transition-colors ${depositMethod === m ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                              {PAYMENT_METHOD_LABEL[m]}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={useAdvForMonth} onChange={e => setUseAdvForMonth(e.target.checked)} className="w-4 h-4 accent-blue-900" />
                          <span className="text-xs text-gray-600">Use advance to cover current month?</span>
                        </label>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>Stored advance available: <strong>{fmt(getStoredAdvanceBalance(data.payments, selected?.id ?? ''))}</strong></p>
                        <p>If you use stored advance, the current month will be marked paid via advance usage.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                <strong>{selected.name}</strong> → {block.name}, Unit {unit.number}
              </div>
            </div>
          )}

          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleConfirm} disabled={!selected} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800 disabled:opacity-50">Reinstate</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Lessees Component ───────────────────────────────────────────────────
export function Lessees({ data, onUpdateData }: Props) {
  const [activeLocId, setActiveLocId] = useState(data.locations[0]?.id ?? '');
  const [newLesseeModal, setNewLesseeModal] = useState<{ unit: Unit; block: Block; mode: 'new' | 'returning' } | null>(null);
  const [multiUnitModal, setMultiUnitModal] = useState(false);
  const [changeUnitModal, setChangeUnitModal] = useState<{ lessee: Lessee } | null>(null);
  const [blockSort, setBlockSort] = useState<'asc' | 'desc'>('asc');
  const { ask, dialog: confirmDialog } = useConfirm();

  const locExists = data.locations.some(l => l.id === activeLocId);
  const currentLocId = locExists ? activeLocId : (data.locations[0]?.id ?? '');

  const locBlocks = data.blocks
    .filter(b => b.locationId === currentLocId)
    .sort((a, b) => blockSort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  const occupiedMap = buildOccupiedMap(data);

  const handleNewLessee = (lessee: Lessee, extraPayments: import('../data/types').Payment[]) => {
    onUpdateData({
      ...data,
      lessees: [...data.lessees, lessee],
      payments: [...data.payments, ...extraPayments.map(p => ({ ...p, lesseeId: lessee.id }))],
    });
    setNewLesseeModal(null);
  };

  const handleMultiUnit = (lessee: Lessee, extraPayments: import('../data/types').Payment[]) => {
    // If this lessee already exists (returning), update their record; otherwise insert new.
    const isReturning = data.lessees.some(l => l.id === lessee.id);
    onUpdateData({
      ...data,
      lessees: isReturning
        ? data.lessees.map(l => l.id === lessee.id ? lessee : l)
        : [...data.lessees, lessee],
      payments: [...data.payments, ...extraPayments.map(p => ({ ...p, lesseeId: lessee.id }))],
    });
    setMultiUnitModal(false);
  };

  const handleChangeUnit = (newUnitId: string, newBlockId: string, newLocationId: string) => {
    if (!changeUnitModal) return;
    onUpdateData({ ...data, lessees: data.lessees.map(l =>
      l.id === changeUnitModal.lessee.id ? { ...l, unitId: newUnitId, unitIds: undefined, blockId: newBlockId, locationId: newLocationId } : l
    )});
    setChangeUnitModal(null);
  };

  const handleDeleteLessee = (lessee: Lessee) => {
    ask(`Remove ${lessee.name} from active lessees?`, () =>
      onUpdateData({ ...data, lessees: data.lessees.map(l =>
        l.id === lessee.id ? { ...l, isActive: false, endDate: new Date().toISOString().split('T')[0] } : l
      )})
    );
  };


  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">Lessees</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMultiUnitModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-700 text-white text-sm rounded-lg hover:bg-purple-800">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Assign Multiple Units
          </button>
        </div>
      </div>

      {/* Location tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {data.locations.map(loc => (
          <button key={loc.id} onClick={() => setActiveLocId(loc.id)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${currentLocId === loc.id ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {loc.name}
          </button>
        ))}
        {data.locations.length === 0 && <span className="px-4 py-2.5 text-sm text-gray-400">No locations. Add one in Settings.</span>}
      </div>

      {/* Block sort */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Sort blocks:</span>
        <button onClick={() => setBlockSort(s => s === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-sm text-gray-700 border-gray-300 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Blocks {blockSort === 'asc' ? 'A → Z' : 'Z → A'}
        </button>
      </div>

      {/* Blocks */}
      <div className="space-y-6">
        {locBlocks.map(block => {
          const blockUnits = data.units.filter(u => u.blockId === block.id).sort((a, b) => a.order - b.order);
          return (
            <div key={block.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold text-gray-700">{block.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{blockUnits.filter(u => occupiedMap.has(u.id)).length}/{blockUnits.length} occupied</span>
                </div>
              </div>

              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {blockUnits.map(unit => {
                  const lessee = occupiedMap.get(unit.id);
                  const isOccupied = !!lessee;
                  const isMultiUnit = isOccupied && !!(lessee?.unitIds?.length);
                  return (
                    <div key={unit.id} className={`rounded-lg border-2 p-3 text-sm transition-all ${isOccupied ? (isMultiUnit ? 'border-purple-200 bg-purple-50' : 'border-blue-200 bg-blue-50') : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-700">Unit {unit.number}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${isOccupied ? (isMultiUnit ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700') : 'bg-gray-200 text-gray-500'}`}>
                          {isOccupied ? (isMultiUnit ? 'Multi' : 'Occupied') : 'Vacant'}
                        </span>
                      </div>

                      {isOccupied && lessee ? (
                        <div className="space-y-1">
                          <p className="font-medium text-gray-800 text-xs truncate" title={lessee.name}>{lessee.name}</p>
                          <p className="text-gray-500 text-xs">{fmt(lessee.monthlyRent)}/mo</p>
                          {isMultiUnit && (
                            <p className="text-purple-600 text-xs">{(lessee.unitIds?.length ?? 0) + 1} units total</p>
                          )}
                          {lessee.hasDepositAdvance && (
                            <span className="inline-block text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">Adv. Dep.</span>
                          )}
                          <div className="flex gap-1 pt-1">
                            <button onClick={() => setChangeUnitModal({ lessee })}
                              className="flex-1 text-xs py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100">
                              Change Unit
                            </button>
                            <button onClick={() => handleDeleteLessee(lessee)}
                              className="text-xs py-1 px-2 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">×</button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-gray-400 text-xs italic">No lessee</p>
                          <div className="flex flex-col gap-1">
                            <div className="flex gap-1">
                              <button onClick={() => setNewLesseeModal({ unit, block, mode: 'new' })}
                                className="flex-1 text-xs py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">+ New</button>
                              <button onClick={() => setNewLesseeModal({ unit, block, mode: 'returning' })}
                                className="flex-1 text-xs py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100">↩ Return</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {blockUnits.length === 0 && (
                  <div className="col-span-full text-center py-6 text-gray-400 text-sm">No units yet.</div>
                )}
                {/* Block-level Add New Lessee button */}
                <div className="col-span-full pt-3 border-t border-gray-100 flex justify-end">
                  <button onClick={() => {
                      const placeholderUnit = { id: '', blockId: block.id, number: '', order: 0 } as Unit;
                      setNewLesseeModal({ unit: placeholderUnit, block, mode: 'new' });
                    }}
                    className="text-xs py-1 px-3 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">
                    + Add new lessee
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {locBlocks.length === 0 && currentLocId && (
          <div className="text-center py-12 text-gray-400">
            <p>No blocks in this location yet. Add one in Settings → Locations.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {newLesseeModal && newLesseeModal.mode === 'new' && (
        <NewLesseeModal unit={newLesseeModal.unit} block={newLesseeModal.block}
          locationId={currentLocId} data={data} onConfirm={handleNewLessee} onCancel={() => setNewLesseeModal(null)} />
      )}
      {newLesseeModal && newLesseeModal.mode === 'returning' && (
        <ReturningLesseeModal unit={newLesseeModal.unit} block={newLesseeModal.block}
          locationId={currentLocId} data={data}
          onConfirm={(reinstated, extraPayments) => {
            onUpdateData({
              ...data,
              lessees: data.lessees.map(l => l.id === reinstated.id ? reinstated : l),
              payments: [...data.payments, ...extraPayments.map(p => ({ ...p, lesseeId: reinstated.id }))],
            });
            setNewLesseeModal(null);
          }}
          onCancel={() => setNewLesseeModal(null)} />
      )}
      {multiUnitModal && (
        <MultiUnitModal data={data} onConfirm={handleMultiUnit} onCancel={() => setMultiUnitModal(false)} />
      )}
      {changeUnitModal && (
        <ChangeUnitModal lessee={changeUnitModal.lessee} data={data} onConfirm={handleChangeUnit} onCancel={() => setChangeUnitModal(null)} />
      )}
      {confirmDialog}
    </div>
  );
}
