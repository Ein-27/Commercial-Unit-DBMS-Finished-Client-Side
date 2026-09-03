/**
 * History component — lessee directory with unified per-transaction payment table in view.
 * SOA is per payment transaction. Block filter checks all blocks ever occupied.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppData, Lessee, Payment, PaymentMethod, PaymentType } from '../data/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAYMENT_METHOD_LABEL, generateId, getStoredAdvanceBalance } from '../data/store';
import { enterToNext, getLesseeBlockUnitGroups } from '../utils';
import { Button } from './ui/button';
import { useConfirm, ConfirmDialog, PrintTitleModal } from './ConfirmDialog';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (n: number) => `₱${n.toLocaleString()}`;
const MIN_DATE_YEAR = 2022;
const MAX_DATE_YEAR = new Date().getFullYear() + 1;

const parseDateValue = (value: string) => {
  const [yearPart, monthPart, dayPart] = value.split('-').map(part => parseInt(part, 10));
  const year = Number.isFinite(yearPart) ? yearPart : new Date().getFullYear();
  const month = Number.isFinite(monthPart) ? monthPart : new Date().getMonth() + 1;
  const day = Number.isFinite(dayPart) ? dayPart : new Date().getDate();
  return { year, month, day };
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const formatDateValue = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const CustomSelect = ({ options, value, onChange, className, buttonClass, labelFn, selectedLabelFn, dropdownLabelFn }: {
  options: Array<{ label: string; value: any }>;
  value: any;
  onChange: (v: any) => void;
  className?: string;
  buttonClass?: string;
  labelFn?: (o: { label: string; value: any }) => string;
  selectedLabelFn?: (o: { label: string; value: any }) => string;
  dropdownLabelFn?: (o: { label: string; value: any }) => string;
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
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
  const displayLabel = selectedLabelFn ? selectedLabelFn(selected) : (labelFn ? labelFn(selected) : selected.label);
  const dropdownLabel = (option: { label: string; value: any }) => dropdownLabelFn ? dropdownLabelFn(option) : (labelFn ? labelFn(option) : option.label);

  return (
    <div ref={ref} className={`relative overflow-visible min-w-0 ${className ?? ''}`}>
      <button ref={buttonRef} type="button" onClick={() => setOpen(s => !s)}
        className={`w-full text-left flex items-center justify-between ${buttonClass ?? 'px-1 py-1 text-xs'} bg-white border border-transparent`}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="truncate">{displayLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400 ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div role="listbox" style={menuStyle} className="bg-white border border-gray-200 rounded shadow-2xl max-h-44 overflow-y-auto whitespace-nowrap">
          {options.map(o => (
            <div key={String(o.value)} role="option" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') { onChange(o.value); setOpen(false); } }}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">{dropdownLabel(o)}</div>
          ))}
        </div>
      )}
    </div>
  );
};

function MdySelect({ value, onChange, className, maxYear }: { value: string; onChange: (v: string) => void; className?: string; maxYear?: number }) {
  const currentYear = new Date().getFullYear();
  const parts = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').map(Number) : [currentYear, 1, 1];
  const selYear = parts[0], selMonth = parts[1], selDay = parts[2];
  const upperYear = Math.max(currentYear + 1, selYear, maxYear ?? currentYear + 1);
  const years = Array.from({ length: upperYear - MIN_DATE_YEAR + 1 }, (_, i) => MIN_DATE_YEAR + i);
  const daysInMonth = new Date(selYear, selMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const clamp = (y: number, m: number, d: number) => Math.min(d, new Date(y, m, 0).getDate());
  const update = (y: number, m: number, d: number) => onChange(`${y}-${String(m).padStart(2, '0')}-${String(clamp(y, m, d)).padStart(2, '0')}`);

  const LocalSelect = ({ options, value, onChange, labelFn, selectedLabelFn, dropdownLabelFn }: {
    options: Array<{ label: string; value: any }>;
    value: any;
    onChange: (v: any) => void;
    labelFn?: (o: { label: string; value: any }) => string;
    selectedLabelFn?: (o: { label: string; value: any }) => string;
    dropdownLabelFn?: (o: { label: string; value: any }) => string;
  }) => (
    <CustomSelect
      options={options}
      value={value}
      onChange={onChange}
      className="min-w-0"
      buttonClass="w-full text-left px-2 py-1 text-[0.8rem] bg-white border border-transparent rounded-lg"
      labelFn={labelFn}
      selectedLabelFn={selectedLabelFn}
      dropdownLabelFn={dropdownLabelFn}
    />
  );

  return (
    <div className={`w-full min-w-0 ${className ?? ''}`}>
      <div className="flex items-center w-full min-w-0 gap-0.5">
        <div className="w-[3.8rem] sm:w-[4.2rem] flex-shrink-0">
          <LocalSelect
            options={MONTH_NAMES_FULL.map((m, i) => ({ label: m, value: i + 1 }))}
            value={selMonth}
            onChange={(v: number) => update(selYear, Number(v), selDay)}
            selectedLabelFn={o => MONTHS[o.value - 1]}
            dropdownLabelFn={o => `${String(o.value).padStart(2, '0')} - ${o.label}`}
          />
        </div>
        <div className="px-0.5 text-gray-400 select-none">/</div>
        <div className="w-[3.2rem] sm:w-[3.6rem] flex-shrink-0">
          <LocalSelect
            options={days.map(d => ({ label: String(d), value: d }))}
            value={selDay}
            onChange={(v: number) => update(selYear, selMonth, Number(v))}
          />
        </div>
        <div className="px-0.5 text-gray-400 select-none">/</div>
        <div className="w-[4.2rem] sm:w-[4.6rem] flex-shrink-0">
          <LocalSelect
            options={years.map(y => ({ label: String(y), value: y }))}
            value={selYear}
            onChange={(v: number) => update(Number(v), selMonth, selDay)}
          />
        </div>
      </div>
    </div>
  );
}

function MonthYearPicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const currentYear = new Date().getFullYear();
  const parts = value && /^\d{4}-\d{2}$/.test(value) ? value.split('-').map(Number) : [currentYear, 1];
  const selYear = parts[0], selMonth = parts[1];
  const upperYear = Math.max(currentYear + 1, selYear, MAX_DATE_YEAR);
  const years = Array.from({ length: upperYear - MIN_DATE_YEAR + 1 }, (_, i) => MIN_DATE_YEAR + i);
  const update = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, '0')}`);

  return (
    <div className={`rounded-lg border border-gray-300 bg-white px-1 py-0.5 ${className ?? 'w-[10rem]'}`}>
      <div className="flex items-center min-w-0 gap-0.5">
        <div className="w-[4.2rem] flex-shrink-0">
          <CustomSelect
            options={MONTH_NAMES_FULL.map((m, i) => ({ label: m, value: i + 1 }))}
            value={selMonth}
            onChange={(v: number) => update(selYear, Number(v))}
            buttonClass="w-full text-left px-1.5 py-1 text-[0.75rem] bg-white border border-transparent"
            selectedLabelFn={o => MONTHS[o.value - 1]}
            dropdownLabelFn={o => `${String(o.value).padStart(2, '0')} - ${o.label}`}
          />
        </div>
        <div className="px-0.5 text-gray-400 select-none">/</div>
        <div className="w-[4.2rem] flex-shrink-0">
          <CustomSelect
            options={years.map(y => ({ label: String(y), value: y }))}
            value={selYear}
            onChange={(v: number) => update(Number(v), selMonth)}
            buttonClass="w-full text-left px-1.5 py-1 text-[0.75rem] bg-white border border-transparent"
          />
        </div>
      </div>
    </div>
  );
}

function DateInputField({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const parts = parseDateValue(value);
  const updateDate = (next: Partial<typeof parts>) => {
    const year = next.year ?? parts.year;
    const month = next.month ?? parts.month;
    const day = next.day ?? parts.day;
    const safeDay = Math.min(day, getDaysInMonth(year, month));
    onChange(formatDateValue(year, month, safeDay));
  };

  return (
    <div className={`w-full rounded-lg border border-gray-300 bg-white px-1 py-0.5 ${className ?? 'w-[11.5rem]'}`} style={{ maxWidth: 'calc(100% - 0.2rem)' }}>
      <MdySelect value={formatDateValue(parts.year, parts.month, parts.day)} onChange={value => {
        const [year, month, day] = value.split('-').map(part => parseInt(part, 10));
        updateDate({ year, month, day });
      }} className="w-full" maxYear={MAX_DATE_YEAR} />
    </div>
  );
}

function getAllUnitIds(l: Lessee): string[] {
  return [...new Set([l.unitId, ...(l.unitIds ?? [])].filter(Boolean))];
}

interface Props { data: AppData; onUpdateData: (data: AppData) => void }

function getPaymentColor(payment: Payment, allMonthPayments: Payment[]): string {
  if (payment.type === 'deposit_advance') return 'text-blue-600 font-semibold';
  if (payment.type === 'advance_used') return 'text-lime-700 font-semibold';
  const nonAdv = allMonthPayments.filter(p => p.type !== 'deposit_advance' && p.type !== 'advance_used');
  const totalPaid = nonAdv.reduce((s, p) => s + p.amount, 0);
  const monthComplete = totalPaid >= payment.totalDue;
  if (payment.type === 'downpayment') return monthComplete ? 'text-orange-500 font-semibold' : 'text-red-500 font-semibold';
  if (nonAdv.length > 1) return 'text-orange-500 font-semibold';
  return 'text-green-600 font-semibold';
}

function getPaymentStatus(payment: Payment, allMonthPayments: Payment[]): string {
  if (payment.type === 'deposit_advance') return 'Advance Deposit';
  if (payment.type === 'advance_used') return 'Advance Used';
  const nonAdv = allMonthPayments.filter(p => p.type !== 'deposit_advance' && p.type !== 'advance_used');
  const totalPaid = nonAdv.reduce((s, p) => s + p.amount, 0);
  const complete = totalPaid >= payment.totalDue;
  if (payment.type === 'downpayment') return complete ? 'Partial — paid' : 'Partial — incomplete';
  if (nonAdv.length > 1) return 'Final (multi-payment)';
  return 'Full Payment';
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs p-3 bg-gray-50 rounded-lg border border-gray-200">
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500" /> Full payment</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500" /> Advance deposit or advance payment</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-lime-500" /> Both full payment and advance deposit</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-400" /> Incomplete payment</span>
    </div>
  );
}

// ─── Edit Lessee Modal (pop-up) ───────────────────────────────────────────────
interface EditLesseeModalProps { lessee: Lessee; data: AppData; onConfirm: (u: Lessee) => void; onCancel: () => void }
function EditLesseeModal({ lessee, data, onConfirm, onCancel }: EditLesseeModalProps) {
  const [form, setForm] = useState({ ...lessee });
  const [err, setErr] = useState('');
  const { ask, dialog: confirmDialog } = useConfirm();
  const locBlocks = data.blocks.filter(b => b.locationId === form.locationId);
  const blockUnits = data.units.filter(u => u.blockId === form.blockId);
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    if (form.monthlyRent <= 0) { setErr('Enter a valid monthly rent.'); return; }
    ask(`Save changes to ${form.name}?`, () => onConfirm({ ...form, name: form.name.trim() }), 'Save', 'flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800');
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
          <h3 className="text-white font-semibold">Edit Lessee</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" data-form>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} onKeyDown={enterToNext} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Monthly Rent (₱)</label>
              <input type="number" value={form.monthlyRent} onChange={e => setForm(f => ({ ...f, monthlyRent: parseFloat(e.target.value) || 0 }))} className={inp} onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()} /></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <select value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value, blockId: '', unitId: '' }))} className={inp} onKeyDown={enterToNext}>
                {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Block</label>
              <select value={form.blockId} onChange={e => setForm(f => ({ ...f, blockId: e.target.value, unitId: '' }))} className={inp} onKeyDown={enterToNext}>
                <option value="">Select block</option>{locBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
              <select value={form.unitId} onChange={e => setForm(f => ({ ...f, unitId: e.target.value }))} className={inp} onKeyDown={enterToNext}>
                <option value="">Select unit</option>{blockUnits.map(u => <option key={u.id} value={u.id}>Unit {u.number}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className={inp} onKeyDown={enterToNext} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input type="date" value={form.endDate ?? ''} onChange={e => setForm(f => ({ ...f, endDate: e.target.value || undefined, isActive: !e.target.value }))} className={inp} onKeyDown={enterToNext} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="isActiveChk" checked={form.isActive}
                onChange={e => {
                  const newActive = e.target.checked;
                  const lastPayDate = data.payments
                    .filter(p => p.lesseeId === lessee.id)
                    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
                  setForm(f => ({ ...f, isActive: newActive, endDate: newActive ? undefined : (lastPayDate ?? new Date().toISOString().split('T')[0]) }));
                }}
                className="w-4 h-4 accent-blue-900" />
              <label htmlFor="isActiveChk" className="text-sm text-gray-700">Currently Active</label>
            </div>
          </div>
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Save Changes</button>
          </div>
        </form>
        {confirmDialog}
      </div>
    </div>
  );
}

// ─── Edit Payment Modal (pop-up) ──────────────────────────────────────────────
interface PaymentFormState extends Omit<Payment, 'amount' | 'totalDue'> {
  amount: string;
  totalDue: string;
}

interface EditPaymentModalProps { payment: Payment; lessee: Lessee; advBalance: number; yearOptions: number[]; onSave: (p: Payment, useAdvanceRemainder?: boolean) => void; onCancel: () => void }
function EditPaymentModal({ payment, lessee, advBalance, yearOptions, onSave, onCancel }: EditPaymentModalProps) {
  const [form, setForm] = useState<PaymentFormState>({
    ...payment,
    amount: String(payment.amount),
    totalDue: String(payment.totalDue),
  });
  const [useAdvanceRemainder, setUseAdvanceRemainder] = useState(false);
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const amountValue = Number(form.amount) || 0;
  const totalDueValue = Number(form.totalDue) || 0;
  const remainingBalance = Math.max(0, totalDueValue - amountValue);
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-4">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
          <h3 className="text-white font-semibold">Edit Transaction</h3>
          <p className="text-blue-200 text-sm">{lessee.name}</p>
        </div>
        <div className="p-6 space-y-4" data-form>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Reference number (numeric)</label>
              <input type="number" value={parseInt(form.soa ?? '') || ''}
                onChange={e => setForm(f => ({ ...f, soa: e.target.value ? String(parseInt(e.target.value)).padStart(4,'0') : undefined }))}
                onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()} className={inp} placeholder="e.g. 0042" /></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Date Paid (MM/DD/YYYY)</label>
              <DateInputField value={form.date} onChange={value => setForm(f => ({ ...f, date: value }))} className="w-[11.5rem] max-w-full" /></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">For Month</label>
              <MonthYearPicker value={form.forMonth} onChange={value => setForm(f => ({ ...f, forMonth: value }))} className="w-[10rem] max-w-full" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Payment['type'] }))} onKeyDown={enterToNext} className={inp}>
                <option value="monthly">Full Payment</option>
                <option value="downpayment">Partial</option>
                <option value="deposit_advance">Advance Deposit</option>
                <option value="advance_used">Advance Used</option>
              </select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as Payment['method'] }))} onKeyDown={enterToNext} className={inp}>
                {(['cash','check','digital'] as const).map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()} className={inp} min="0" inputMode="numeric" placeholder="0" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Total Due (₱)</label>
              <input type="number" value={form.totalDue} onChange={e => setForm(f => ({ ...f, totalDue: e.target.value }))} onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()} className={inp} min="0" inputMode="numeric" placeholder="0" /></div>
          </div>
          {form.type === 'downpayment' && amountValue > 0 && amountValue < totalDueValue && advBalance > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useAdvanceRemainder}
                  onChange={e => setUseAdvanceRemainder(e.target.checked)}
                  disabled={advBalance < remainingBalance}
                  className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                />
                <span className="text-gray-700">Use advance deposit balance to pay remaining {fmt(remainingBalance)}.</span>
              </label>
              {useAdvanceRemainder && advBalance < remainingBalance && (
                <p className="text-xs text-red-600 mt-2">Need at least {fmt(remainingBalance)} advance balance.</p>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={() => onSave({
              ...form,
              amount: amountValue,
              totalDue: totalDueValue,
              isComplete: amountValue >= totalDueValue,
            }, useAdvanceRemainder)} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddPaymentModal({ lessee, advBalance, yearOptions, onSave, onCancel }: { lessee: Lessee; advBalance: number; yearOptions: number[]; onSave: (p: Payment, useAdvanceRemainder?: boolean) => void; onCancel: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [form, setForm] = useState<PaymentFormState>({
    id: generateId(),
    lesseeId: lessee.id,
    soa: undefined,
    amount: String(lessee.monthlyRent),
    totalDue: String(lessee.monthlyRent),
    date: today,
    method: 'cash',
    type: 'monthly',
    forMonth: currentMonth,
    isComplete: true,
  });
  const [useAdvanceRemainder, setUseAdvanceRemainder] = useState(false);
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const [ym, mm] = form.forMonth.split('-');
  const amountValue = Number(form.amount) || 0;
  const totalDueValue = Number(form.totalDue) || 0;
  const remainingBalance = Math.max(0, totalDueValue - amountValue);

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-4">
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl">
          <h3 className="text-white font-semibold">Add Transaction</h3>
          <p className="text-blue-200 text-sm">{lessee.name}</p>
        </div>
        <div className="p-6 space-y-4" data-form>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">SOA (numeric)</label>
              <input type="number" value={parseInt(form.soa ?? '') || ''}
                onChange={e => setForm(f => ({ ...f, soa: e.target.value ? String(parseInt(e.target.value)).padStart(4,'0') : undefined }))}
                onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()} className={inp} placeholder="e.g. 0042" /></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Date Paid (MM/DD/YYYY)</label>
              <DateInputField value={form.date} onChange={value => setForm(f => ({ ...f, date: value }))} className="w-[11.5rem] max-w-full" /></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">For Month</label>
              <MonthYearPicker value={form.forMonth} onChange={value => setForm(f => ({ ...f, forMonth: value }))} className="w-[10rem] max-w-full" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Payment['type'] }))} onKeyDown={enterToNext} className={inp}>
                <option value="monthly">Full Payment</option>
                <option value="downpayment">Partial</option>
                <option value="deposit_advance">Advance Deposit</option>
                <option value="advance_used">Advance Used</option>
              </select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as Payment['method'] }))} onKeyDown={enterToNext} className={inp}>
                {(['cash','check','digital'] as const).map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()} className={inp} min="0" inputMode="numeric" placeholder="0" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Total Due (₱)</label>
              <input type="number" value={form.totalDue} onChange={e => setForm(f => ({ ...f, totalDue: e.target.value }))} onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()} className={inp} min="0" inputMode="numeric" placeholder="0" /></div>
          </div>
          {form.type === 'downpayment' && amountValue > 0 && amountValue < totalDueValue && advBalance > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useAdvanceRemainder}
                  onChange={e => setUseAdvanceRemainder(e.target.checked)}
                  disabled={advBalance < remainingBalance}
                  className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                />
                <span className="text-gray-700">Use advance deposit balance to pay remaining {fmt(remainingBalance)}.</span>
              </label>
              {useAdvanceRemainder && advBalance < remainingBalance && (
                <p className="text-xs text-red-600 mt-2">Need at least {fmt(remainingBalance)} advance balance.</p>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={() => onSave({
              ...form,
              id: generateId(),
              amount: amountValue,
              totalDue: totalDueValue,
              isComplete: amountValue >= totalDueValue,
            }, useAdvanceRemainder)} className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel (unified table) ────────────────────────────────────────────
type HistoryViewMode = 'list' | 'monthly-table';

interface LesseeDetailProps { lessee: Lessee; data: AppData; onDeletePayment: (id: string) => void; onUpdatePayment: (p: Payment, useAdvanceRemainder?: boolean) => void; onAddPayment: (p: Payment, useAdvanceRemainder?: boolean) => void; onClose: () => void }
function LesseeDetail({ lessee, data, onDeletePayment, onUpdatePayment, onAddPayment, onClose }: LesseeDetailProps) {
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [printPending, setPrintPending] = useState(false);
  const [viewMode, setViewMode] = useState<HistoryViewMode>('list');
  const [paymentPage, setPaymentPage] = useState(1);
  const PAYMENT_PAGE_SIZE = 8;
  const { ask, dialog: confirmDialog } = useConfirm();

  const advBalance = getStoredAdvanceBalance(data.payments, lessee.id);

  const payments = data.payments
    .filter(p => p.lesseeId === lessee.id)
    .sort((a, b) => {
      const monthCompare = b.forMonth.localeCompare(a.forMonth);
      if (monthCompare !== 0) return monthCompare;
      return a.date.localeCompare(b.date);
    });
  const paymentYears = Array.from(new Set(payments.map(p => p.forMonth.split('-')[0]))).sort((a, b) => Number(a) - Number(b));
  const yearOptions = Array.from(new Set([new Date().getFullYear(), ...paymentYears.map(y => Number(y))])).sort((a, b) => a - b);
  const initialYear = paymentYears.length > 0 ? Number(paymentYears[paymentYears.length - 1]) : new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);

  useEffect(() => {
    if (paymentYears.length === 0) {
      setSelectedYear(new Date().getFullYear());
      return;
    }
    if (!paymentYears.includes(String(selectedYear))) {
      setSelectedYear(Number(paymentYears[paymentYears.length - 1]));
    }
  }, [paymentYears, selectedYear]);

  const getBlockName = (blockId: string) => data.blocks.find(b => b.id === blockId)?.name ?? '?';
  const getUnitNum = (unitId: string) => data.units.find(u => u.id === unitId)?.number ?? '?';
  const getLoc = (locId: string) => data.locations.find(l => l.id === locId)?.name ?? '?';

  const blockUnitGroups = getLesseeBlockUnitGroups(data, lessee);

  const byMonth = new Map<string, Payment[]>();
  payments.forEach(p => {
    if (!byMonth.has(p.forMonth)) byMonth.set(p.forMonth, []);
    byMonth.get(p.forMonth)!.push(p);
  });

  const handlePrint = () => setPrintPending(true);

  const paymentPageCount = Math.max(Math.ceil(payments.length / PAYMENT_PAGE_SIZE), 1);
  const pagedPayments = payments.slice((paymentPage - 1) * PAYMENT_PAGE_SIZE, paymentPage * PAYMENT_PAGE_SIZE);

  useEffect(() => {
    if (paymentPage > paymentPageCount) {
      setPaymentPage(paymentPageCount);
    }
  }, [paymentPageCount, paymentPage]);

  useEffect(() => {
    setPaymentPage(1);
  }, [payments.length, viewMode]);

  const executePrint = (title: string) => {
    if (!title) title = `Transaction History — ${lessee.name}`;
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = payments.map(p => {
      const [py, pm] = p.forMonth.split('-').map(Number);
      const mp = byMonth.get(p.forMonth) ?? [];
      const c = getPaymentColor(p, mp);
      const color = c.includes('green') ? '#16a34a' : c.includes('orange') ? '#ea580c' : c.includes('red') ? '#dc2626' : '#2563eb';
      const blockStr = blockUnitGroups.map(g => `${g.blockName}`).join(', ');
      const formatUnits = (group: { units: string[] }) => {
        const units = [...group.units].sort((a, b) => parseInt(a) - parseInt(b));
        return units.length > 0 ? units.join(', ') : '—';
      };
      const unitStr = blockUnitGroups.map(g => blockUnitGroups.length > 1 ? `(${g.blockName}) ${formatUnits(g)}` : formatUnits(g)).join(' | ');
      return `<tr><td>${p.date}</td><td>${p.soa ?? '—'}</td><td>${blockStr}</td><td>${unitStr}</td><td>${fmt(lessee.monthlyRent)}</td><td>${PAYMENT_METHOD_LABEL[p.method]}</td><td>${p.type.replace('_',' ')}</td><td style="text-align:right;color:${color}">${fmt(p.amount)}</td><td style="text-align:right">${fmt(p.totalDue)}</td><td>${getPaymentStatus(p, mp)}</td></tr>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>R. A. Del Rosario Construction</title><style>body{font-family:sans-serif;font-size:11px;padding:20px}h1{font-size:16px}h2{font-size:12px;color:#555;font-weight:normal}p{margin:0 0 8px;font-size:11px;color:#666}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:4px 8px}th{background:#1e3a5f;color:#fff}tr:nth-child(even){background:#f9f9f9}</style></head><body>
      <h1>R. A. Del Rosario Construction</h1><h2>${title}</h2>
      <p>${getLoc(lessee.locationId)} — ${lessee.isActive ? 'Active' : 'Left: ' + lessee.endDate} — Joined: ${lessee.startDate}</p>
      <table><thead><tr><th>Date</th><th>Ref No.</th><th>Block</th><th>Unit</th><th>Rent/mo</th><th>Method</th><th>Type</th><th>Amount</th><th>Total Due</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div style="margin-top:8px;text-align:right;font-weight:bold;border-top:2px solid #1e3a5f;padding-top:6px">Total Paid: ${fmt(payments.reduce((s,p)=>s+p.amount,0))}</div>
    </body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl my-4 max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col">
        {/* Header — Name, Location, Date Joined/Left, Rent (active only) */}
        <div className="bg-blue-900 px-6 py-4 rounded-t-xl flex items-start justify-between sticky top-0 z-10">
          <div>
            <h3 className="text-white font-semibold text-lg">{lessee.name}</h3>
            <div className="text-blue-200 text-sm mt-1 flex flex-wrap gap-3">
              <span>Location: <strong>{getLoc(lessee.locationId)}</strong></span>
              <span>Joined: <strong>{lessee.startDate}</strong></span>
              {!lessee.isActive && lessee.endDate && <span>Left: <strong>{lessee.endDate}</strong></span>}
              {lessee.isActive && <span>Rent: <strong>{fmt(lessee.monthlyRent)}/mo</strong></span>}
              <span className={lessee.isActive ? 'text-green-300' : 'text-red-300'}>
                {lessee.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white ml-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <Legend />
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              Stored Advance Balance: <strong className={advBalance > 0 ? 'text-yellow-600' : 'text-gray-400'}>{fmt(advBalance)}</strong>
              <span className="text-gray-400 ml-2">· Manage in Settings → Lessee Status</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCreatingPayment(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add Transaction
              </button>
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewMode === 'list' ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-white'}`}>
                  Original List
                </button>
                <button onClick={() => setViewMode('monthly-table')} className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewMode === 'monthly-table' ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-white'}`}>
                  Monthly Table
                </button>
              </div>
              <button onClick={handlePrint} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-900 text-white rounded-lg hover:bg-blue-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Print
              </button>
            </div>
          </div>

          {viewMode === 'monthly-table' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">Payments by month for <span className="font-semibold text-gray-700">{selectedYear}</span></p>
                {paymentYears.length > 0 && (
                  <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {paymentYears.map(year => <option key={year} value={year}>{year}</option>)}
                  </select>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="bg-blue-900 text-white text-xs uppercase">
                      <th className="px-3 py-2.5 text-left">Type</th>
                      {MONTHS.map((m) => <th key={m} className="px-2 py-2.5 text-center min-w-[72px]">{m}</th>)}
                      <th className="px-3 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100 bg-white">
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-700">Payments</td>
                      {MONTHS.map((_, mi) => {
                        const mStr = `${selectedYear}-${String(mi + 1).padStart(2, '0')}`;
                        const monthTransactions = payments.filter(p => p.forMonth === mStr);
                        const monthTotal = monthTransactions.reduce((s, p) => s + p.amount, 0);
                        const txnCount = monthTransactions.length;
                        const hasAdvance = monthTransactions.some(p => p.type === 'deposit_advance' || p.type === 'advance_used');
                        const hasFullPayment = monthTransactions.some(p => p.type === 'monthly' || p.type === 'downpayment');
                        const isFullPayment = hasFullPayment && monthTotal >= lessee.monthlyRent;
                        const isIncomplete = hasFullPayment && monthTotal < lessee.monthlyRent && !hasAdvance;
                        const cellClass = !txnCount
                          ? 'text-gray-300'
                          : hasAdvance && isFullPayment
                            ? 'bg-lime-100 text-lime-700'
                            : hasAdvance
                              ? 'bg-yellow-100 text-yellow-700'
                              : isFullPayment
                                ? 'bg-green-100 text-green-700'
                                : isIncomplete
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'text-gray-700';
                        return (
                          <td key={mStr} className="px-2 py-2.5 text-center text-xs">
                            {txnCount > 0 ? (
                              <div className={`leading-tight rounded-md px-2 py-1 ${cellClass}`}>
                                <div className="font-semibold">{fmt(monthTotal)}</div>
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-700">
                        {fmt(payments.filter(p => p.forMonth.startsWith(String(selectedYear))).reduce((s, p) => s + p.amount, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-900 text-white text-xs uppercase">
                    <th className="px-3 py-2.5 text-left">Date</th>
                    <th className="px-3 py-2.5 text-left">For Month</th>
                    <th className="px-3 py-2.5 text-left">Ref No.</th>
                    <th className="px-3 py-2.5 text-left">Block</th>
                    <th className="px-3 py-2.5 text-left">Unit</th>
                    <th className="px-3 py-2.5 text-right">Rent/mo</th>
                    <th className="px-3 py-2.5 text-left">Method</th>
                    <th className="px-3 py-2.5 text-left">Type</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 text-right">Total Due</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPayments.map((pay, idx) => {
                    const monthPays = byMonth.get(pay.forMonth) ?? [];
                    const blockStr = blockUnitGroups.map(g => `${g.blockName}`).join(', ');
                    const formatUnits = (group: { units: string[] }) => {
                      const units = [...group.units].sort((a, b) => parseInt(a) - parseInt(b));
                      return units.length > 0 ? units.join(', ') : '—';
                    };
                    const unitStr = blockUnitGroups.map(g =>
                      blockUnitGroups.length > 1
                        ? `(${g.blockName}) ${formatUnits(g)}`
                        : formatUnits(g)
                    ).join(' | ');
                    return (
                      <tr key={pay.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}>
                        <td className="px-3 py-2 text-gray-500 text-xs">{pay.date}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{MONTHS[parseInt(pay.forMonth.split('-')[1]) - 1]} {pay.forMonth.split('-')[0]}</td>
                        <td className="px-3 py-2 font-mono text-blue-700 text-xs">{pay.soa ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{blockStr}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{unitStr}</td>
                        <td className="px-3 py-2 text-right text-gray-600 text-xs">{fmt(lessee.monthlyRent)}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{PAYMENT_METHOD_LABEL[pay.method]}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs capitalize">{pay.type.replace('_',' ')}</td>
                        <td className={`px-3 py-2 text-right ${getPaymentColor(pay, monthPays)}`}>{fmt(pay.amount)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 text-xs">{fmt(pay.totalDue)}</td>
                        <td className="px-3 py-2 text-xs">{getPaymentStatus(pay, monthPays)}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setEditingPayment(pay)}
                              className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100">Edit</button>
                            <button onClick={() => ask('Delete this payment entry?', () => onDeletePayment(pay.id))}
                              className="w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center text-xs">×</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pagedPayments.length === 0 && (
                    <tr><td colSpan={12} className="text-center py-8 text-gray-400">No payments recorded.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-semibold text-sm">
                    <td colSpan={8} className="px-3 py-2.5 text-right text-gray-600">Total Payments:</td>
                    <td className="px-3 py-2.5 text-right text-gray-800">{fmt(payments.reduce((s, p) => s + p.amount, 0))}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
              {paymentPageCount > 1 && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-600">
                  <div>Page {paymentPage} of {paymentPageCount} — {payments.length} transaction{payments.length === 1 ? '' : 's'}</div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPaymentPage(p => Math.max(1, p - 1))}
                      disabled={paymentPage === 1}
                      className="gap-2"
                    >
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => setPaymentPage(p => Math.min(paymentPageCount, p + 1))}
                      disabled={paymentPage === paymentPageCount}
                      className="gap-2"
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {editingPayment && (
        <EditPaymentModal payment={editingPayment} lessee={lessee} advBalance={advBalance} yearOptions={yearOptions}
          onSave={(p, useAdvanceRemainder) => { onUpdatePayment(p, useAdvanceRemainder); setEditingPayment(null); }}
          onCancel={() => setEditingPayment(null)} />
      )}
      {creatingPayment && (
        <AddPaymentModal lessee={lessee} advBalance={advBalance} yearOptions={yearOptions}
          onSave={(p, useAdvanceRemainder) => { onAddPayment(p, useAdvanceRemainder); setCreatingPayment(false); setSelectedYear(Number(p.forMonth.split('-')[0])); }}
          onCancel={() => setCreatingPayment(false)} />
      )}
      {printPending && (
        <PrintTitleModal
          defaultTitle={`Transaction History — ${lessee.name}`}
          onConfirm={t => { setPrintPending(false); executePrint(t); }}
          onCancel={() => setPrintPending(false)}
        />
      )}
      {confirmDialog}
    </div>
  );
}

// ─── Main History Component ───────────────────────────────────────────────────
export function History({ data, onUpdateData }: Props) {
  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedLessee, setSelectedLessee] = useState<Lessee | null>(null);
  const [editingLessee, setEditingLessee] = useState<Lessee | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const { ask, dialog: confirmDialog } = useConfirm();

  const getLoc = (l: Lessee) => data.locations.find(loc => loc.id === l.locationId)?.name ?? '';

  const getAllBlockNames = (l: Lessee): string[] => {
    return [...new Set(getLesseeBlockUnitGroups(data, l).map(group => group.blockName))];
  };

  const allBlocks = [...new Set(data.blocks.map(b => b.name))].sort();

  const getBlockMapForLessee = (l: Lessee): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    getLesseeBlockUnitGroups(data, l).forEach(group => {
      map.set(group.blockName, [...group.units]);
    });
    return map;
  };

  const filtered = data.lessees.filter(l => {
    const q = search.toLowerCase();
    if (q && !l.name.toLowerCase().includes(q) && !getLoc(l).toLowerCase().includes(q) &&
        !l.startDate.includes(q) && !(l.endDate ?? '').includes(q) &&
        !getAllBlockNames(l).some(b => b.toLowerCase().includes(q))) return false;
    if (blockFilter && !getAllBlockNames(l).includes(blockFilter)) return false;
    if (locFilter && l.locationId !== locFilter) return false;
    if (statusFilter === 'active' && !l.isActive) return false;
    if (statusFilter === 'inactive' && l.isActive) return false;
    return true;
  }).sort((a, b) => b.startDate.localeCompare(a.startDate));

  /** Expand each lessee into one row per block. */
  interface HistoryRow { lessee: Lessee; blockName: string; units: string[] }
  const expandedHistoryRows: HistoryRow[] = filtered.flatMap(l => {
    const bm = getBlockMapForLessee(l);
    if (bm.size === 0) return [{ lessee: l, blockName: '', units: [] }];
    return [...bm.entries()]
      .filter(([bname]) => !blockFilter || bname === blockFilter)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([blockName, units]) => ({
        lessee: l, blockName,
        units: units.sort((a, b) => parseInt(a) - parseInt(b))
      }));
  });
  const pageCount = Math.max(Math.ceil(expandedHistoryRows.length / PAGE_SIZE), 1);
  const pagedHistoryRows = expandedHistoryRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, blockFilter, locFilter, statusFilter]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [pageCount, page]);

  const handleDeletePayment = (id: string) =>
    onUpdateData({ ...data, payments: data.payments.filter(p => p.id !== id) });

  const handleAddPayment = (payment: Payment, useAdvanceRemainder?: boolean) => {
    const nextPayments = [...data.payments, payment];
    const remaining = payment.totalDue - payment.amount;
    const currentAdvanceBalance = getStoredAdvanceBalance(data.payments, payment.lesseeId);
    const hasAdvanceUsed = data.payments.some(p => p.lesseeId === payment.lesseeId && p.forMonth === payment.forMonth && p.type === 'advance_used');
    const shouldAddAdvanceUsed = useAdvanceRemainder && payment.type === 'downpayment' && remaining > 0 && !hasAdvanceUsed && currentAdvanceBalance >= remaining;
    const finalPayments = shouldAddAdvanceUsed
      ? [...nextPayments, {
          id: generateId(),
          lesseeId: payment.lesseeId,
          soa: payment.soa,
          amount: remaining,
          totalDue: payment.totalDue,
          date: payment.date,
          method: payment.method,
        type: 'advance_used' as PaymentType,
          forMonth: payment.forMonth,
          isComplete: true,
        }]
      : nextPayments;
    onUpdateData({ ...data, payments: finalPayments });
  };

  const handleUpdatePayment = (updated: Payment, useAdvanceRemainder?: boolean) => {
    const updatedPayments = data.payments.map(p => p.id === updated.id ? updated : p);
    const remaining = updated.totalDue - updated.amount;
    const currentAdvanceBalance = getStoredAdvanceBalance(data.payments, updated.lesseeId);
    const hasAdvanceUsed = updatedPayments.some(p => p.lesseeId === updated.lesseeId && p.forMonth === updated.forMonth && p.type === 'advance_used');
    const shouldAddAdvanceUsed = useAdvanceRemainder && updated.type === 'downpayment' && remaining > 0 && !hasAdvanceUsed && currentAdvanceBalance >= remaining;
    const nextPayments = shouldAddAdvanceUsed
      ? [...updatedPayments, {
          id: generateId(),
          lesseeId: updated.lesseeId,
          soa: updated.soa,
          amount: remaining,
          totalDue: updated.totalDue,
          date: updated.date,
          method: updated.method,
          type: 'advance_used' as PaymentType,
          forMonth: updated.forMonth,
          isComplete: true,
        }]
      : updatedPayments;
    onUpdateData({ ...data, payments: nextPayments });
  };

  const handleDeleteLessee = (lessee: Lessee) => {
    ask(`Delete "${lessee.name}" and ALL their payment records? This cannot be undone.`, () => {
      onUpdateData({
        ...data,
        lessees: data.lessees.filter(l => l.id !== lessee.id),
        payments: data.payments.filter(p => p.lesseeId !== lessee.id),
      });
      if (selectedLessee?.id === lessee.id) setSelectedLessee(null);
    });
  };

  const handleEditSave = (updated: Lessee) => {
    const nextLessees = data.lessees.map(l => l.id === updated.id ? updated : l);
    const endMonth = updated.endDate ? updated.endDate.slice(0, 7) : undefined;

    const nextPayments = endMonth
      ? data.payments.filter(p => {
          if (p.lesseeId !== updated.id) return true;
          // Keep payments for the same lessee if they are not auto-generated zero-payment records,
          // or if they are for months on or before the updated lease end date.
          if (p.notes !== 'Auto-generated zero-payment record') return true;
          return p.forMonth <= endMonth;
        })
      : data.payments;

    onUpdateData({ ...data, lessees: nextLessees, payments: nextPayments });
    setEditingLessee(null);
    if (selectedLessee?.id === updated.id) setSelectedLessee(updated);
  };

  const executeSummaryPrint = (title: string) => {
    if (!title) title = 'Lessee History Summary';
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = filtered.map(l => {
      const total = data.payments.filter(p => p.lesseeId === l.id).reduce((s, p) => s + p.amount, 0);
      const blocks = getAllBlockNames(l).join(', ');
      return `<tr><td>${l.name}</td><td>${blocks}</td><td>${getLoc(l)}</td><td>${l.startDate}</td><td>${l.endDate ?? 'Active'}</td><td>₱${total.toLocaleString()}</td></tr>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>R. A. Del Rosario Construction</title><style>body{font-family:sans-serif;font-size:12px;padding:20px}h1{font-size:16px}h2{font-size:13px;color:#555;font-weight:normal}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 10px}th{background:#1e3a5f;color:#fff}tr:nth-child(even){background:#f9f9f9}</style></head><body>
      <h1>R. A. Del Rosario Construction</h1><h2>${title}</h2>
      <table><thead><tr><th>Name</th><th>Blocks</th><th>Location</th><th>Start</th><th>End</th><th>Total Paid</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">History</h2>
      </div>

      <Legend />

      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={enterToNext}
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search name, block, location..." />
        <select value={blockFilter} onChange={e => setBlockFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Blocks</option>
          {allBlocks.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Locations</option>
          {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-900 text-white text-xs uppercase">
                <th className="px-3 py-3 text-left rounded-tl-xl">Name</th>
                <th className="px-3 py-3 text-left">Block</th>
                <th className="px-3 py-3 text-left">Unit(s)</th>
                <th className="px-3 py-3 text-left">Location</th>
                <th className="px-3 py-3 text-left">Start</th>
                <th className="px-3 py-3 text-left">End</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-right">Total Paid</th>
                <th className="px-3 py-3 text-center rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedHistoryRows.map((row, idx) => {
                const { lessee: l, blockName, units } = row;
                const totalPaid = data.payments.filter(p => p.lesseeId === l.id).reduce((s, p) => s + p.amount, 0);
                return (
                  <tr key={`${l.id}-${blockName}`} onClick={() => setSelectedLessee(l)}
                    className={`border-b border-gray-100 cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{l.name}</td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">{blockName ? blockName : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">{units.join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{getLoc(l)}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{l.startDate}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{l.endDate ?? '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${l.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {l.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-700">{fmt(totalPaid)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setSelectedLessee(l)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">View</button>
                        <button onClick={() => setEditingLessee(l)} className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100">Edit</button>
                        <button onClick={() => handleDeleteLessee(l)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pagedHistoryRows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No records found.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={7} className="px-3 py-3 text-right text-sm font-semibold text-gray-600">Grand Total:</td>
                <td className="px-3 py-3 text-right font-bold text-gray-800">
                  {fmt(filtered.reduce((s, l) => s + data.payments.filter(p => p.lesseeId === l.id).reduce((ss, p) => ss + p.amount, 0), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-gray-50 border-t border-gray-200">
          <div className="text-xs text-gray-600">Page {page} of {pageCount} — {expandedHistoryRows.length} record{expandedHistoryRows.length === 1 ? '' : 's'}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="gap-2"
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className="gap-2"
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {selectedLessee && (
        <LesseeDetail lessee={selectedLessee} data={data}
          onDeletePayment={handleDeletePayment}
          onUpdatePayment={handleUpdatePayment}
          onAddPayment={handleAddPayment}
          onClose={() => setSelectedLessee(null)} />
      )}
      {editingLessee && (
        <EditLesseeModal lessee={editingLessee} data={data}
          onConfirm={handleEditSave} onCancel={() => setEditingLessee(null)} />
      )}
      {confirmDialog}
    </div>
  );
}
