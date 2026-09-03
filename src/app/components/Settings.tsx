import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react';
import type { AppData, Lessee, Payment, Location, PaymentMethod, UnitHistoryEntry } from '../data/types';
import { createDepositPayments, generateId, PAYMENT_METHOD_LABEL, getStoredAdvanceBalance } from '../data/store';
import { enterToNext } from '../utils';
import { useConfirm } from './ConfirmDialog';

type Tab = 'locations' | 'lessee-status' | 'past-lessee' | 'account' | 'soa-search';

interface Props {
  data: AppData;
  onUpdateData: (data: AppData) => void;
  onClose: () => void;
  onSwitchAccount: () => void;
}

const fmt = (n: number) => `₱${n.toLocaleString()}`;
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const METHODS: PaymentMethod[] = ['cash', 'check', 'digital'];
const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
const inpSm = 'w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';

const getMaxDataYear = (data: AppData) => {
  const years = [new Date().getFullYear()];
  data.lessees.forEach(l => {
    const year = parseInt(l.startDate.slice(0, 4));
    if (!Number.isNaN(year)) years.push(year);
    if (l.endDate) {
      const endYear = parseInt(l.endDate.slice(0, 4));
      if (!Number.isNaN(endYear)) years.push(endYear);
    }
  });
  data.payments.forEach(p => {
    const year = parseInt(p.date.slice(0, 4));
    if (!Number.isNaN(year)) years.push(year);
  });
  return Math.max(...years);
};

// Reusable custom select that always renders dropdown below with capped height
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
  const displayLabel = selectedLabelFn ? selectedLabelFn(selected) : (labelFn ? labelFn(selected) : selected.label);
  const dropdownLabel = (option: { label: string; value: any }) => dropdownLabelFn ? dropdownLabelFn(option) : (labelFn ? labelFn(option) : option.label);
  const getPlainMonthLabel = (label: string) => label.replace(/^\d{2}\s*[–-]\s*/, '');
  return (
    <div ref={ref} className={`relative overflow-visible min-w-0 ${className ?? ''}`}>
      <button ref={buttonRef} type="button" onClick={() => setOpen(s => !s)}
        className={`w-full text-left flex items-center justify-between ${buttonClass ?? 'px-1 py-1 text-xs'} bg-white border border-transparent`}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="truncate">{getPlainMonthLabel(displayLabel)}</span>
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

function MonthYearPicker({ value, onChange, className, maxYear }: { value: string; onChange: (v: string) => void; className?: string; maxYear?: number }) {
  const parts = value ? value.split('-') : [];
  const selYear = parts[0] ? parseInt(parts[0]) : new Date().getFullYear();
  const selMonth = parts[1] ? parseInt(parts[1]) : new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const upperYear = Math.max(currentYear, selYear, maxYear ?? currentYear);
  const years = Array.from({ length: upperYear - 2022 + 1 }, (_, i) => 2022 + i);
  const update = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, '0')}`);
  return (
    <div className={`flex gap-1 min-w-0 ${className ?? ''}`}>
      <div className="min-w-0 flex-1">
        <CustomSelect
          options={MONTH_NAMES_FULL.map((m, i) => ({ label: m, value: i + 1 }))}
          value={selMonth}
          onChange={(v: number) => update(selYear, Number(v))}
          buttonClass="w-full text-left px-2 py-1 text-xs bg-white border border-transparent"
          dropdownLabelFn={o => `${String(o.value).padStart(2, '0')} - ${o.label}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <CustomSelect
          options={years.map(y => ({ label: String(y), value: y }))}
          value={selYear}
          onChange={(v: number) => update(Number(v), selMonth)}
          buttonClass="w-full text-center px-2 py-1 text-xs bg-white border border-transparent"
        />
      </div>
    </div>
  );
}

// Dropdown date selector that stores as YYYY-MM-DD internally
function MdySelect({ value, onChange, className, maxYear }: { value: string; onChange: (v: string) => void; className?: string; maxYear?: number }) {
  const currentYear = new Date().getFullYear();
  const parts = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').map(Number) : [currentYear, 1, 1];
  const selYear = parts[0], selMonth = parts[1], selDay = parts[2];
  const upperYear = Math.max(currentYear, selYear, maxYear ?? currentYear);
  const years = Array.from({ length: upperYear - 2022 + 1 }, (_, i) => 2022 + i);
  const daysInMonth = new Date(selYear, selMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const clamp = (y: number, m: number, d: number) => Math.min(d, new Date(y, m, 0).getDate());
  const update = (y: number, m: number, d: number) =>
    onChange(`${y}-${String(m).padStart(2,'0')}-${String(clamp(y,m,d)).padStart(2,'0')}`);

  const LocalSelect = ({ options, value, onChange, labelFn, selectedLabelFn, dropdownLabelFn, className }: {
    options: Array<{ label: string; value: any }>;
    value: any;
    onChange: (v: any) => void;
    labelFn?: (o: { label: string; value: any }) => string;
    selectedLabelFn?: (o: { label: string; value: any }) => string;
    dropdownLabelFn?: (o: { label: string; value: any }) => string;
    className?: string;
  }) => (
    <CustomSelect
      options={options}
      value={value}
      onChange={onChange}
      className={className}
      buttonClass="w-full text-left px-1.5 py-1 text-[0.75rem] bg-white border border-transparent"
      labelFn={labelFn}
      selectedLabelFn={selectedLabelFn}
      dropdownLabelFn={dropdownLabelFn}
    />
  );

  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <div className="flex items-center min-w-0 gap-0.5">
        <div className="w-[3.6rem] sm:w-[4rem] flex-shrink-0">
          <LocalSelect
            options={MONTH_NAMES_FULL.map((m, i) => ({ label: m, value: i + 1 }))}
            value={selMonth}
            onChange={(v: number) => update(selYear, Number(v), selDay)}
            selectedLabelFn={o => MONTHS_SHORT[o.value - 1]}
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
        <div className="w-[3.8rem] sm:w-[4.2rem] flex-shrink-0">
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

// ─── Locations Tab ────────────────────────────────────────────────────────────
function LocationsTab({ data, onUpdateData }: { data: AppData; onUpdateData: (d: AppData) => void }) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [err, setErr] = useState('');
  const { ask, dialog: confirmDialog } = useConfirm();

  // Image upload removed for client build. Use plain URL inputs for images.

  // Block/unit management state
  const [blockLocId, setBlockLocId] = useState<string>(() => data.locations[0]?.id ?? '');
  const [addingBlock, setAddingBlock] = useState(false);
  const [newBlockName, setNewBlockName] = useState('');
  const [addingUnitBlockId, setAddingUnitBlockId] = useState<string | null>(null);
  const [newUnitNumber, setNewUnitNumber] = useState('');

  const handleAddBlock = () => {
    if (!newBlockName.trim()) return;
    const existing = data.blocks.filter(b => b.locationId === blockLocId);
    if (existing.some(b => b.name.toUpperCase() === newBlockName.trim().toUpperCase())) {
      alert('A block with that name already exists in this location.');
      return;
    }
    const newBlock = { id: generateId(), locationId: blockLocId, name: newBlockName.trim().toUpperCase(), order: existing.length + 1 };
    onUpdateData({ ...data, blocks: [...data.blocks, newBlock] });
    setNewBlockName(''); setAddingBlock(false);
  };

  const handleDeleteBlock = (blockId: string) => {
    const hasActiveLessees = data.lessees.some(l => l.isActive && l.blockId === blockId);
    if (hasActiveLessees) { alert('Cannot delete: block has active lessees.'); return; }
    ask('Delete this block and all its units?', () => {
      onUpdateData({
        ...data,
        blocks: data.blocks.filter(b => b.id !== blockId),
        units: data.units.filter(u => u.blockId !== blockId),
      });
    });
  };

  const handleAddUnit = (blockId: string) => {
    if (!newUnitNumber.trim()) return;
    const existing = data.units.filter(u => u.blockId === blockId);
    if (existing.some(u => u.number === newUnitNumber.trim())) {
      alert('A unit with that number already exists in this block.');
      return;
    }
    const newUnit = { id: generateId(), blockId, number: newUnitNumber.trim(), order: existing.length + 1 };
    onUpdateData({ ...data, units: [...data.units, newUnit] });
    setNewUnitNumber(''); setAddingUnitBlockId(null);
  };

  const handleDeleteUnit = (unitId: string) => {
    const isOccupied = data.lessees.some(l => l.isActive && (l.unitId === unitId || l.unitIds?.includes(unitId)));
    if (isOccupied) { alert('Cannot delete: unit is currently occupied by an active lessee.'); return; }
    ask('Delete this unit?', () => {
      onUpdateData({ ...data, units: data.units.filter(u => u.id !== unitId) });
    });
  };

  const handleAdd = () => {
    if (!newName.trim()) { setErr('Enter a location name.'); return; }
    const newLoc: Location = { id: generateId(), name: newName.trim(), imageUrl: '' };
    onUpdateData({ ...data, locations: [...data.locations, newLoc] });
    setNewName(''); setErr('');
  };

  const handleSave = (locId: string) => {
    if (!editName.trim()) return;
    onUpdateData({ ...data, locations: data.locations.map(l => l.id === locId ? { ...l, name: editName.trim() } : l) });
    setEditingId(null);
  };

  const handleDelete = (locId: string) => {
    if (data.lessees.some(l => l.isActive && l.locationId === locId)) {
      setErr('Cannot delete: location has active lessees.');
      return;
    }
    ask('Delete this location and all its blocks/units?', () => {
      const blockIds = new Set(data.blocks.filter(b => b.locationId === locId).map(b => b.id));
      onUpdateData({ ...data, locations: data.locations.filter(l => l.id !== locId), blocks: data.blocks.filter(b => b.locationId !== locId), units: data.units.filter(u => !blockIds.has(u.blockId)) });
    });
  };

  return (
    <div className="space-y-5">
      {err && <p className="text-red-500 text-sm">{err}</p>}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Existing Locations</h4>
        <p className="text-xs text-gray-500">The background images you assign here are saved with each location and will be available to other connected systems as well.</p>
        {data.locations.map(loc => (
          <div key={loc.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
            {editingId === loc.id ? (
              <>
                <input value={editName} onChange={e => setEditName(e.target.value)} className={inp} placeholder="Location name" />
                {loc.imageUrl && (
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg overflow-hidden bg-gray-100"><img src={loc.imageUrl} className="w-full h-full object-contain" onError={e => (e.currentTarget.style.display='none')} /></div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
                  <button onClick={() => handleSave(loc.id)} className="flex-1 py-1.5 bg-blue-900 text-white rounded-lg text-sm">Save</button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                {loc.imageUrl && <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0"><img src={loc.imageUrl} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display='none')} /></div>}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{loc.name}</p>
                  <p className="text-xs text-gray-400 truncate">{loc.imageUrl || 'No image'}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => { setEditingId(loc.id); setEditName(loc.name); }} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">Edit</button>
                  <button onClick={() => handleDelete(loc.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100">Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {data.locations.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">No locations yet.</p>}
      </div>
      <div className="border border-dashed border-blue-300 rounded-xl p-4 space-y-3 bg-blue-50/30">
        <h4 className="text-sm font-semibold text-gray-700">Add New Location</h4>
        <input value={newName} onChange={e => { setNewName(e.target.value); setErr(''); }} className={inp} placeholder="Location name" />
        {/* Image URL field removed for client build. New locations will have no image. */}
        <button onClick={handleAdd} className="w-full py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Add Location</button>
      </div>

      {/* Blocks & Units Management */}
      <div className="border-t border-gray-200 pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Blocks &amp; Units</h4>
        {data.locations.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Add a location first to manage blocks and units.</p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Select Location</label>
              <select value={blockLocId} onChange={e => setBlockLocId(e.target.value)} className={inp}>
                {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            {blockLocId && (() => {
              const locBlocks = data.blocks.filter(b => b.locationId === blockLocId).sort((a, b) => a.name.localeCompare(b.name));
              return (
                <div className="space-y-3">
                  {locBlocks.length === 0 && <p className="text-sm text-gray-400 italic text-center py-2">No blocks yet for this location.</p>}
                  {locBlocks.map(block => {
                    const blockUnits = data.units.filter(u => u.blockId === block.id).sort((a, b) => parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number));
                    return (
                      <div key={block.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/40">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700">{block.name}</span>
                          <button onClick={() => handleDeleteBlock(block.id)}
                            className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                            Delete Block
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {blockUnits.map(unit => {
                            const isOccupied = data.lessees.some(l => l.isActive && (l.unitId === unit.id || l.unitIds?.includes(unit.id)));
                            return (
                              <div key={unit.id} className="flex items-center gap-1 border border-gray-200 bg-white rounded px-2 py-1">
                                <span className="text-xs text-gray-700">Unit {unit.number}</span>
                                {isOccupied && <span className="text-xs text-green-600 font-medium">(occupied)</span>}
                                <button onClick={() => handleDeleteUnit(unit.id)}
                                  className="ml-1 text-red-400 hover:text-red-600 text-xs leading-none"
                                  title="Delete unit">
                                  ×
                                </button>
                              </div>
                            );
                          })}
                          {blockUnits.length === 0 && <span className="text-xs text-gray-400 italic">No units yet.</span>}
                        </div>
                        {addingUnitBlockId === block.id ? (
                          <div className="flex gap-2 items-center">
                            <input value={newUnitNumber} onChange={e => setNewUnitNumber(e.target.value)}
                              className={inpSm} placeholder="Unit number (e.g. 101)"
                              onKeyDown={e => { if (e.key === 'Enter') handleAddUnit(block.id); if (e.key === 'Escape') { setAddingUnitBlockId(null); setNewUnitNumber(''); } }} />
                            <button onClick={() => handleAddUnit(block.id)} className="px-2 py-1 text-xs bg-blue-900 text-white rounded hover:bg-blue-800 whitespace-nowrap">Add</button>
                            <button onClick={() => { setAddingUnitBlockId(null); setNewUnitNumber(''); }} className="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => { setAddingUnitBlockId(block.id); setNewUnitNumber(''); }}
                            className="text-xs px-2 py-1 border border-dashed border-blue-300 text-blue-600 rounded hover:bg-blue-50">
                            + Add Unit
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {addingBlock ? (
                    <div className="border border-dashed border-green-300 rounded-xl p-3 bg-green-50/30 space-y-2">
                      <input value={newBlockName} onChange={e => setNewBlockName(e.target.value)}
                        className={inp} placeholder="Block name (e.g. A or BLK1)"
                        onKeyDown={e => { if (e.key === 'Enter') handleAddBlock(); if (e.key === 'Escape') { setAddingBlock(false); setNewBlockName(''); } }} />
                      <div className="flex gap-2">
                        <button onClick={() => { setAddingBlock(false); setNewBlockName(''); }} className="flex-1 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
                        <button onClick={handleAddBlock} className="flex-1 py-1.5 bg-blue-900 text-white rounded-lg text-sm">Add Block</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingBlock(true)}
                      className="w-full py-2 border border-dashed border-blue-300 text-blue-600 text-sm rounded-xl hover:bg-blue-50 transition-colors">
                      + Add Block
                    </button>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {confirmDialog}
    </div>
  );
}

// ─── Lessee Status Tab ────────────────────────────────────────────────────────
function LesseeStatusTab({ data, onUpdateData }: { data: AppData; onUpdateData: (d: AppData) => void }) {
  const [search, setSearch] = useState('');
  const [advModal, setAdvModal] = useState<{ lesseeId: string; amount: string; method: PaymentMethod; forMonth: string } | null>(null);
  const [reactivateModal, setReactivateModal] = useState<{ lessee: Lessee; blockId: string; unitIds: string[]; monthlyRent: string; startDate: string; includeAdvanceDeposit: boolean; advanceDeposit: string; method: PaymentMethod } | null>(null);
  const [updateModal, setUpdateModal] = useState<{ lessee: Lessee; blockId: string; unitIds: string[]; monthlyRent: string } | null>(null);
  const { ask, dialog: confirmDialog } = useConfirm();
  const filtered = data.lessees.filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()) || (l.soa ?? '').includes(search));

  const toggleActive = (lessee: Lessee) => {
    if (lessee.isActive) {
      const lastPayDate = data.payments
        .filter(p => p.lesseeId === lessee.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
      ask(`Mark ${lessee.name} as Inactive?`, () => {
        onUpdateData({
          ...data,
          lessees: data.lessees.map(l => l.id === lessee.id
            ? { ...l, isActive: false, endDate: lastPayDate ?? new Date().toISOString().split('T')[0] }
            : l
          ),
        });
      });
      return;
    }

    const defaultBlockId = data.blocks.find(b => b.locationId === lessee.locationId)?.id ?? '';
    const defaultUnitId = data.units.find(u => u.blockId === defaultBlockId)?.id ?? '';
    setReactivateModal({
      lessee,
      blockId: lessee.blockId || defaultBlockId,
      unitIds: lessee.unitId ? [lessee.unitId] : (defaultUnitId ? [defaultUnitId] : []),
      monthlyRent: String(lessee.monthlyRent),
      startDate: new Date().toISOString().split('T')[0],
      includeAdvanceDeposit: false,
      advanceDeposit: String(lessee.monthlyRent * 3),
      method: 'cash',
    });
  };

  const handleReactivate = () => {
    if (!reactivateModal) return;
    const { lessee, blockId, unitIds, monthlyRent, startDate, includeAdvanceDeposit, advanceDeposit, method } = reactivateModal;
    const rentVal = parseFloat(monthlyRent) || 0;
    const depositVal = parseFloat(advanceDeposit) || 0;
    if (!blockId || rentVal <= 0 || !startDate) return;
    const occupied = unitIds.length > 0 && data.lessees.some(l => l.isActive && l.id !== lessee.id && (l.unitId === unitIds[0] || l.unitIds?.some(uid => unitIds.includes(uid))));
    if (occupied) {
      alert('One or more selected units are currently occupied by another active lessee.');
      return;
    }
    ask(`Reactivate ${lessee.name} with the new details?`, () => {
      const updatedLessees = data.lessees.map(l => l.id === lessee.id
        ? {
            ...l,
            blockId,
            unitId: unitIds.length > 0 ? unitIds[0] : '',
            unitIds: unitIds.length > 1 ? unitIds.slice(1) : undefined,
            monthlyRent: rentVal,
            startDate,
            isActive: true,
            endDate: undefined,
          }
        : l
      );
      const payments = includeAdvanceDeposit && depositVal > 0
        ? [...data.payments, ...createDepositPayments(lessee.id, rentVal, depositVal, method, startDate.slice(0, 7), data.payments, false, 'deposit_advance')]
        : data.payments;
      onUpdateData({ ...data, lessees: updatedLessees, payments });
      setReactivateModal(null);
    });
  };

  const handleAddAdvDeposit = () => {
    if (!advModal) return;
    const val = parseFloat(advModal.amount) || 0;
    if (val <= 0) return;
    const lessee = data.lessees.find(l => l.id === advModal.lesseeId);
    if (!lessee) return;
    const hasMonthPayment = data.payments.some(p =>
      p.lesseeId === lessee.id && p.forMonth === advModal.forMonth && p.type !== 'deposit_advance'
    );
    const hasMonthDeposit = data.payments.some(p =>
      p.lesseeId === lessee.id && p.forMonth === advModal.forMonth && p.type === 'deposit_advance'
    );
    if (hasMonthPayment) {
      alert('This month already has a monthly payment. Clear it before adding an advance deposit.');
      return;
    }
    if (hasMonthDeposit) {
      alert('An advance deposit already exists for this month. Add the balance under a different month.');
      return;
    }
    const newPayments = createDepositPayments(
      lessee.id,
      lessee.monthlyRent,
      val,
      advModal.method,
      advModal.forMonth,
      data.payments,
      false,
      'deposit_advance'
    ).map(payment => ({ ...payment, notes: 'settings_advance_deposit' }));
    onUpdateData({ ...data, payments: [...data.payments, ...newPayments] });
    setAdvModal(null);
  };

  const openUpdateModal = (lessee: Lessee) => {
    const currentUnit = data.units.find(u => u.id === lessee.unitId);
    const currentBlockId = currentUnit?.blockId ?? lessee.blockId;
    const existingUnits = [lessee.unitId, ...(lessee.unitIds ?? [])].filter(Boolean);
    setUpdateModal({
      lessee,
      blockId: currentBlockId,
      unitIds: existingUnits.filter(uid => data.units.some(u => u.id === uid && u.blockId === currentBlockId)),
      monthlyRent: String(lessee.monthlyRent),
    });
  };

  const handleUpdateCurrentStatus = () => {
    if (!updateModal) return;
    const rentVal = parseFloat(updateModal.monthlyRent) || 0;
    if (!updateModal.blockId || rentVal <= 0) return;
    const occupied = updateModal.unitIds.length > 0 && data.lessees.some(l => l.id !== updateModal.lessee.id && l.isActive && (
      updateModal.unitIds.includes(l.unitId) || updateModal.unitIds.some(uid => l.unitIds?.includes(uid))
    ));
    if (occupied) {
      alert('One or more selected units are currently occupied by another active lessee.');
      return;
    }
    ask(`Update ${updateModal.lessee.name}'s current status?`, () => {
      onUpdateData({
        ...data,
        lessees: data.lessees.map(l => l.id === updateModal.lessee.id
              ? {
              ...l,
              blockId: updateModal.blockId,
              unitId: updateModal.unitIds.length > 0 ? updateModal.unitIds[0] : '',
              unitIds: updateModal.unitIds.length > 1 ? updateModal.unitIds.slice(1) : undefined,
              monthlyRent: rentVal,
            }
          : l
        ),
      });
      setUpdateModal(null);
    });
  };

  const handleRemoveLast = (lesseeId: string) => {
    const deposits = data.payments.filter(p => p.lesseeId === lesseeId && p.type === 'deposit_advance');
    const last = [...deposits].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) return;
    ask('Remove the most recent advance deposit entry?', () => {
      onUpdateData({ ...data, payments: data.payments.filter(p => p.id !== last.id) });
    });
  };

  const handleClearAll = (lesseeId: string) => {
    ask('Remove ALL stored advance deposits for this lessee? This cannot be undone.', () => {
      onUpdateData({ ...data, payments: data.payments.filter(p => !(p.lesseeId === lesseeId && p.type === 'deposit_advance')) });
    });
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">Lessee Status &amp; Advance Deposit</h4>
      <input value={search} onChange={e => setSearch(e.target.value)} className={inp} placeholder="Search lessees..." />
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {filtered.map(l => {
          const block = data.blocks.find(b => b.id === l.blockId)?.name ?? '?';
          const unit = data.units.find(u => u.id === l.unitId)?.number ?? '?';
          const advBalance = getStoredAdvanceBalance(data.payments, l.id);
          const deposits = data.payments.filter(p => p.lesseeId === l.id && p.type === 'deposit_advance');
          const isAdvOpen = advModal?.lesseeId === l.id;
          return (
            <div key={l.id} className="border border-gray-200 rounded-xl px-4 py-3 space-y-2.5">
              {/* Active status row */}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-800">{l.name}</span>
                    {l.soa && <span className="text-xs font-mono text-gray-400">#{l.soa}</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${l.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {l.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{block}, Unit {unit} — {fmt(l.monthlyRent)}/mo</p>
                  {l.endDate && <p className="text-xs text-gray-400">Left: {l.endDate}</p>}
                </div>
                <div className="flex-shrink-0 flex gap-1.5">
                  {l.isActive && (
                    <button onClick={() => openUpdateModal(l)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200">
                      Update Status
                    </button>
                  )}
                  <button onClick={() => toggleActive(l)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${l.isActive ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'}`}>
                    {l.isActive ? 'Mark Inactive' : 'Mark Active'}
                  </button>
                </div>
              </div>
              {updateModal?.lessee.id === l.id && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 space-y-2">
                  <p className="text-xs font-medium text-indigo-700">Update Current Status</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Block</label>
                      <select value={updateModal.blockId} onChange={e => setUpdateModal(m => m ? { ...m, blockId: e.target.value, unitId: '' } : m)} className={inpSm}>
                        <option value="">Select block</option>
                        {data.blocks.filter(b => b.locationId === l.locationId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Monthly Rent (₱)</label>
                      <input type="number" value={updateModal.monthlyRent} onChange={e => setUpdateModal(m => m ? { ...m, monthlyRent: e.target.value } : m)} className={inpSm} min="1" onWheel={e => (e.target as HTMLInputElement).blur()} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-0.5">Units</label>
                      <div className="space-y-1 max-h-24 overflow-y-auto rounded border border-gray-200 bg-white p-2">
                        {data.units.filter(u => u.blockId === updateModal.blockId).map(u => {
                          const occupiedBy = data.lessees.find(l2 => l2.isActive && l2.id !== l.id && (l2.unitId === u.id || l2.unitIds?.includes(u.id)));
                          const isSelected = updateModal.unitIds.includes(u.id);
                          const disabled = !!occupiedBy;
                          return (
                            <label key={u.id} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
                              <span className="flex items-center gap-2">
                                <input type="checkbox" checked={isSelected} disabled={disabled} onChange={() => setUpdateModal(m => m ? { ...m, unitIds: isSelected ? m.unitIds.filter(id => id !== u.id) : [...m.unitIds, u.id] } : m)} className="accent-blue-900" />
                                Unit {u.number}
                              </span>
                              {disabled ? <span className="text-red-500">Taken</span> : <span className="text-green-600">Available</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setUpdateModal(null)} className="flex-1 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
                    <button onClick={handleUpdateCurrentStatus} className="flex-1 py-1.5 bg-indigo-700 text-white rounded-lg text-sm">Save Update</button>
                  </div>
                </div>
              )}

              {reactivateModal?.lessee.id === l.id && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-2">
                  <p className="text-xs font-medium text-blue-700">Reactivation Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Block</label>
                      <select value={reactivateModal.blockId} onChange={e => setReactivateModal(m => m ? { ...m, blockId: e.target.value, unitIds: [] } : m)} className={inpSm}>
                        <option value="">Select block</option>
                        {data.blocks.filter(b => b.locationId === l.locationId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Monthly Rent (₱)</label>
                      <input type="number" value={reactivateModal.monthlyRent} onChange={e => setReactivateModal(m => m ? { ...m, monthlyRent: e.target.value } : m)} className={inpSm} min="1" onWheel={e => (e.target as HTMLInputElement).blur()} />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-0.5">Start Date</label>
                          <input type="date" value={reactivateModal.startDate} onChange={e => setReactivateModal(m => m ? { ...m, startDate: e.target.value } : m)} className={inpSm} />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap pb-1">
                          <input type="checkbox" checked={reactivateModal.includeAdvanceDeposit} onChange={e => setReactivateModal(m => m ? { ...m, includeAdvanceDeposit: e.target.checked } : m)} className="accent-blue-900" />
                          Include advance deposit
                        </label>
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-0.5">Units</label>
                      <div className="space-y-1 max-h-24 overflow-y-auto rounded border border-gray-200 bg-white p-2">
                        {data.units.filter(u => u.blockId === reactivateModal.blockId).map(u => {
                          const occupiedBy = data.lessees.find(l2 => l2.isActive && l2.id !== l.id && (l2.unitId === u.id || l2.unitIds?.includes(u.id)));
                          const isSelected = reactivateModal.unitIds.includes(u.id);
                          const disabled = !!occupiedBy;
                          return (
                            <label key={u.id} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
                              <span className="flex items-center gap-2">
                                <input type="checkbox" checked={isSelected} disabled={disabled} onChange={() => setReactivateModal(m => m ? { ...m, unitIds: isSelected ? m.unitIds.filter(id => id !== u.id) : [...m.unitIds, u.id] } : m)} className="accent-blue-900" />
                                Unit {u.number}
                              </span>
                              {disabled ? <span className="text-red-500">Taken</span> : <span className="text-green-600">Available</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {reactivateModal.includeAdvanceDeposit && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Advance Deposit Amount</label>
                        <input type="number" value={reactivateModal.advanceDeposit} onChange={e => setReactivateModal(m => m ? { ...m, advanceDeposit: e.target.value } : m)} className={inpSm} min="0" onWheel={e => (e.target as HTMLInputElement).blur()} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Deposit Method</label>
                        <select value={reactivateModal.method} onChange={e => setReactivateModal(m => m ? { ...m, method: e.target.value as PaymentMethod } : m)} className={inpSm}>
                          {METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setReactivateModal(null)} className="flex-1 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
                    <button onClick={handleReactivate} className="flex-1 py-1.5 bg-blue-900 text-white rounded-lg text-sm">Confirm Reactivation</button>
                  </div>
                </div>
              )}

              {/* Advance deposit row */}
              <div className="border-t border-gray-100 pt-2 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-gray-500">
                    Advance Balance: <strong className={advBalance > 0 ? 'text-yellow-600' : 'text-gray-400'}>{fmt(advBalance)}</strong>
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => setAdvModal({ lesseeId: l.id, amount: String(l.monthlyRent), method: 'cash', forMonth: new Date().toISOString().slice(0, 7) })}
                      className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-200">
                      + Add Deposit
                    </button>
                    {deposits.length > 0 && (
                      <button onClick={() => handleRemoveLast(l.id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">
                        Remove Last
                      </button>
                    )}
                    {deposits.length > 0 && (
                      <button onClick={() => handleClearAll(l.id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
                {isAdvOpen && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-yellow-700">
                      Add Advance Deposit <span className="text-yellow-600 font-normal">(stored balance for a selected month)</span>
                    </p>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Month</label>
                      <input type="month" value={advModal!.forMonth}
                        onChange={e => setAdvModal(m => m ? { ...m, forMonth: e.target.value } : m)}
                        className={inpSm} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Amount to add to stored balance (₱)</label>
                      <input type="number" value={advModal!.amount}
                        onChange={e => setAdvModal(m => m ? { ...m, amount: e.target.value } : m)}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={inpSm} placeholder="Enter amount" min="1" />
                    </div>
                    <p className="text-[11px] text-yellow-700">
                      This adds to the stored advance balance only. The selected month still requires a separate monthly payment.
                    </p>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
                      <div className="flex gap-1.5">
                        {METHODS.map(m => (
                          <button key={m} type="button"
                            onClick={() => setAdvModal(am => am ? { ...am, method: m } : am)}
                            className={`flex-1 py-1 rounded text-xs border transition-colors ${advModal!.method === m ? 'bg-yellow-600 text-white border-yellow-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                            {PAYMENT_METHOD_LABEL[m]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setAdvModal(null)} className="flex-1 py-1.5 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
                      <button onClick={handleAddAdvDeposit} className="flex-1 py-1.5 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700">Add Deposit</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">No lessees match.</p>}
      </div>
      {confirmDialog}
    </div>
  );
}

// ─── Add Past Lessee Tab ──────────────────────────────────────────────────────
interface TransactionRow {
  id: string;
  soa: string;
  forMonth: string;
  datePaid: string;
  type: 'monthly' | 'deposit_advance' | 'downpayment' | 'advance_used';
  method: PaymentMethod;
  amount: string;
  isFollowUp?: boolean;       // follow-up inherits SOA + forMonth from parent
  parentId?: string;          // links to the downpayment this follows up on
  depositMode?: 'store' | 'use'; // for deposit_advance: storing or using stored advance
  useAdvanceRemainder?: boolean; // follow-up option to pay remaining with stored advance
}

interface UnitPeriod {
  id: string;
  locationId: string;
  blockId: string;
  unitIds: string[];
  monthlyRent: string;
  dateJoined: string;
  isActive: boolean;
  transactions: TransactionRow[];
}

function makeEmptyTransaction(rentVal: number, type: TransactionRow['type'] = 'monthly', soaHint = ''): TransactionRow {
  return {
    id: generateId(), soa: soaHint,
    forMonth: new Date().toISOString().slice(0, 7),
    datePaid: new Date().toISOString().split('T')[0],
    type, method: 'cash',
    amount: (type === 'monthly' || type === 'advance_used') && rentVal > 0 ? String(rentVal) : '',
  };
}

function makeDepositRows(rentVal: number, startMonth: string, method: PaymentMethod, soaHint = ''): TransactionRow[] {
  return [{
    id: generateId(), soa: soaHint, forMonth: startMonth,
    datePaid: new Date().toISOString().split('T')[0],
    type: 'deposit_advance' as const, method,
    amount: rentVal > 0 ? String(rentVal * 3) : '',
    depositMode: 'store',
  }];
}

function PastLesseeTab({ data, onUpdateData }: { data: AppData; onUpdateData: (d: AppData) => void }) {
  const [name, setName] = useState('');
  const [unitPeriods, setUnitPeriods] = useState<UnitPeriod[]>([]);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  const maxYearInData = getMaxDataYear(data);

  // Build map of occupied unit IDs (active lessees only)
  const occupiedUnits = new Map<string, string>();
  data.lessees.filter(l => l.isActive).forEach(l => {
    if (l.unitId) occupiedUnits.set(l.unitId, l.name);
    l.unitIds?.forEach(uid => occupiedUnits.set(uid, l.name));
  });

  const makeEmptyPeriod = (): UnitPeriod => ({
    id: generateId(), locationId: data.locations[0]?.id ?? '',
    blockId: '', unitIds: [], monthlyRent: '',
    dateJoined: new Date().toISOString().split('T')[0],
    isActive: false, transactions: [],
  } as any);

  const addUnitPeriod = () => setUnitPeriods(prev => [...prev, makeEmptyPeriod()]);

  const duplicatePeriod = (period: UnitPeriod) => {
    const copy: UnitPeriod = { ...period, id: generateId(), transactions: period.transactions.map(t => ({ ...t, id: generateId(), soa: '' })) };
    setUnitPeriods(prev => [...prev, copy]);
  };

  const updatePeriod = (id: string, field: string, value: string | boolean | string[]) => {
    setUnitPeriods(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      if (field === 'locationId') { updated.blockId = ''; updated.unitIds = []; }
      if (field === 'blockId') { updated.unitIds = []; }
      return updated;
    }));
  };

  const toggleUnit = (periodId: string, unitId: string, isOccupied: boolean, periodIsActive: boolean) => {
    if (isOccupied && periodIsActive) return; // occupied units are unpickable when period is active
    setUnitPeriods(prev => prev.map(p => {
      if (p.id !== periodId) return p;
      const currentIds = p.unitIds ?? [];
      const ids = currentIds.includes(unitId) ? currentIds.filter(u => u !== unitId) : [...currentIds, unitId];
      return { ...p, unitIds: ids };
    }));
  };

  const removePeriod = (id: string) => setUnitPeriods(prev => prev.filter(p => p.id !== id));

  const addTransaction = (periodId: string, type: TransactionRow['type']) => {
    setUnitPeriods(prev => prev.map(p => {
      if (p.id !== periodId) return p;
      const rentVal = parseFloat(p.monthlyRent) || 0;
      if (type === 'deposit_advance') {
        const rows = makeDepositRows(rentVal, p.dateJoined.slice(0, 7), 'cash');
        return { ...p, transactions: [...p.transactions, ...rows] };
      }
      return { ...p, transactions: [...p.transactions, makeEmptyTransaction(type === 'monthly' || type === 'advance_used' ? rentVal : 0, type)] };
    }));
  };

  const addFollowUpTransaction = (periodId: string, parentTx: TransactionRow) => {
    const followUp: TransactionRow = {
      id: generateId(), soa: parentTx.soa, forMonth: parentTx.forMonth,
      datePaid: new Date().toISOString().split('T')[0],
      type: 'downpayment', method: 'cash', amount: '',
      isFollowUp: true, parentId: parentTx.id,
      useAdvanceRemainder: false,
    };
    setUnitPeriods(prev => prev.map(p => {
      if (p.id !== periodId) return p;
      const txs = [...p.transactions];
      const parentIdx = txs.findIndex(t => t.id === parentTx.id);
      txs.splice(parentIdx + 1, 0, followUp);
      return { ...p, transactions: txs };
    }));
  };

  const updateTransaction = (periodId: string, txId: string, field: keyof TransactionRow, value: string) => {
    setUnitPeriods(prev => prev.map(p => {
      if (p.id !== periodId) return p;
      const rentVal = parseFloat(p.monthlyRent) || 0;
      return {
        ...p,
        transactions: p.transactions.map(t => {
          if (t.id !== txId) return t;
          const updated = { ...t, [field]: value };
          if (field === 'type') {
            updated.amount = (value === 'monthly' || value === 'advance_used') && rentVal > 0 ? String(rentVal) : '';
          }
          return updated;
        }),
      };
    }));
  };

  const removeTransaction = (periodId: string, txId: string) =>
    setUnitPeriods(prev => prev.map(p => p.id !== periodId ? p : { ...p, transactions: p.transactions.filter(t => t.id !== txId && t.parentId !== txId) }));

  const getFormSoaStatus = (soa: string, isFollowUp?: boolean) => {
    const soaNum = parseInt(soa);
    if (isFollowUp || isNaN(soaNum) || soaNum <= 0) return null;
    const soaStr = String(soaNum).padStart(4, '0');

    const formSoaCounts = new Map<string, number>();
    unitPeriods.forEach(period => {
      period.transactions.forEach(tx => {
        if (tx.isFollowUp) return;
        const txSoaNum = parseInt(tx.soa);
        if (isNaN(txSoaNum) || txSoaNum <= 0) return;
        const txSoaStr = String(txSoaNum).padStart(4, '0');
        formSoaCounts.set(txSoaStr, (formSoaCounts.get(txSoaStr) ?? 0) + 1);
      });
    });

    const existingSoas = new Set(data.payments.map(p => p.soa).filter(Boolean));
    if (formSoaCounts.get(soaStr)! > 1) {
      return `Duplicate Ref No. #${soaStr} found in this form.`;
    }
    if (existingSoas.has(soaStr)) {
      return `Ref No. #${soaStr} already exists in saved records.`;
    }
    return null;
  };

  // Compute accumulated advance balance in the form up to (but not including) targetTxId
  const getFormAdvBalanceAt = (targetTxId: string): number => {
    let balance = 0;
    for (const p of unitPeriods) {
      const rentVal = parseFloat(p.monthlyRent) || 0;
      for (const tx of p.transactions) {
        if (tx.id === targetTxId) return Math.max(0, balance);
        if (tx.type !== 'deposit_advance') continue;
        if (tx.depositMode === 'use') {
          balance = Math.max(0, balance - rentVal);
        } else {
          balance += parseFloat(tx.amount) || 0;
        }
      }
    }
    return Math.max(0, balance);
  };

  const handleSave = () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (unitPeriods.length === 0) { setErr('Add at least one unit period.'); return; }
    for (const p of unitPeriods) {
      if (!p.dateJoined) { setErr('All unit periods need a Date Joined.'); return; }
      if (!p.monthlyRent || parseFloat(p.monthlyRent) <= 0) { setErr('All unit periods need a monthly rent.'); return; }
      if (!p.locationId) { setErr('Location is required for all periods.'); return; }
      if (!p.blockId) { setErr('Block is required for all periods.'); return; }
      // Units are optional now; do not require p.unitIds
    }

    // SOA duplicate check within the form (non-follow-up transactions only)
    const formSoaMap = new Map<string, string>();
    const existingSoas = new Set(data.payments.map(p => p.soa).filter(Boolean));
    for (const p of unitPeriods) {
      for (const tx of p.transactions) {
        if (tx.isFollowUp) continue;
        const soaNum = parseInt(tx.soa);
        if (isNaN(soaNum) || soaNum <= 0) continue;
        const soaStr = String(soaNum).padStart(4, '0');
        if (formSoaMap.has(soaStr)) {
          setErr(`Duplicate Ref No. #${soaStr} found in this form. Each transaction must have a unique reference number (follow-up payments are exempt).`);
          return;
        }
        if (existingSoas.has(soaStr)) {
          setErr(`Ref No. #${soaStr} already exists in saved records. Please use a unique reference number.`);
          return;
        }
        formSoaMap.set(soaStr, tx.id);
      }
    }

    const createdLessees: Lessee[] = [];
    const allPayments: Payment[] = [];

    for (const period of unitPeriods) {
      const rentVal = parseFloat(period.monthlyRent) || 0;
      const periodDatesPaid = period.transactions.map(t => t.datePaid).filter(Boolean).sort();
      const lastDatePaid = periodDatesPaid[periodDatesPaid.length - 1];
      const endDate = !period.isActive ? (lastDatePaid || period.dateJoined) : undefined;
      const primaryUnitId = (period.unitIds && period.unitIds.length > 0) ? period.unitIds[0] : '';
      const primaryUnit = data.units.find(u => u.id === primaryUnitId);
      const primaryBlock = data.blocks.find(b => b.id === (primaryUnit?.blockId ?? period.blockId));
      const unitHistoryEntry: UnitHistoryEntry = {
        blockId: period.blockId || '',
        unitId: primaryUnitId,
        locationId: period.locationId,
        monthlyRent: rentVal,
        dateJoined: period.dateJoined,
        dateLeft: endDate,
      };

      const newLessee: Lessee = {
        id: generateId(), name: name.trim(), soa: undefined,
        unitId: primaryUnitId,
        unitIds: period.unitIds && period.unitIds.length > 1 ? period.unitIds : undefined,
        blockId: (primaryBlock?.id ?? period.blockId) || '',
        locationId: period.locationId,
        monthlyRent: rentVal,
        startDate: period.dateJoined,
        endDate,
        isActive: period.isActive,
        hasDepositAdvance: period.transactions.some(t => t.type === 'deposit_advance'),
        unitHistory: [unitHistoryEntry],
      };

      createdLessees.push(newLessee);

      for (const tx of period.transactions) {
        const isUseMode = tx.type === 'deposit_advance' && tx.depositMode === 'use';
        // For "use" mode, use the auto-computed balance (= monthly rent from this period)
        const amt = isUseMode ? rentVal : (parseFloat(tx.amount) || 0);
        const soaNum = parseInt(tx.soa);
        const soa = !isNaN(soaNum) && soaNum > 0 ? String(soaNum).padStart(4, '0') : undefined;
        // For deposit_advance in 'use' mode, store as advance_used instead
        const payType: Payment['type'] = isUseMode ? 'advance_used' : tx.type;
        allPayments.push({
          id: generateId(), lesseeId: newLessee.id, soa,
          amount: amt, totalDue: rentVal,
          date: tx.datePaid, method: tx.method, type: payType,
          forMonth: tx.forMonth, isComplete: amt >= rentVal,
        });
      }
    }

    onUpdateData({ ...data, lessees: [...data.lessees, ...createdLessees], payments: [...data.payments, ...allPayments] });
    setSuccess(`"${name.trim()}" added with ${createdLessees.length} history record(s) and ${allPayments.length} transaction(s).`);
    setName(''); setUnitPeriods([]); setErr('');
  };

  return (
    <div className="space-y-5">
      <h4 className="text-sm font-semibold text-gray-700">Register Past / Unrecorded Lessee</h4>

      <div data-form>
        <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
        <input value={name} onChange={e => { setName(e.target.value); setErr(''); }}
          onKeyDown={enterToNext} className={inp} placeholder="Full name" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">
            Unit Transaction History ({unitPeriods.length} period{unitPeriods.length !== 1 ? 's' : ''})
          </h4>
          <button onClick={addUnitPeriod} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-900 text-white rounded-lg hover:bg-blue-800">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add a Unit Transaction History
          </button>
        </div>

        <div className="space-y-4">
          {unitPeriods.map((period, pi) => {
            const locBlocks = data.blocks.filter(b => b.locationId === period.locationId).sort((a, b) => a.name.localeCompare(b.name));
            const blockUnits = data.units.filter(u => u.blockId === period.blockId).sort((a, b) => parseInt(a.number) - parseInt(b.number));
            const rentVal = parseFloat(period.monthlyRent) || 0;
            const totalPaid = period.transactions.filter(t => t.type !== 'deposit_advance').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

            return (
              <div key={period.id} className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700">Unit Period {pi + 1}</span>
                  <button onClick={() => removePeriod(period.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </div>

                <div className="grid grid-cols-2 gap-2" data-form>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Date Joined *</label>
                    <MdySelect value={period.dateJoined}
                      onChange={v => updatePeriod(period.id, 'dateJoined', v)}
                      className={inpSm}
                      maxYear={maxYearInData} />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input type="checkbox" id={`active-${period.id}`} checked={period.isActive}
                      onChange={e => updatePeriod(period.id, 'isActive', e.target.checked)}
                      className="w-4 h-4 accent-blue-900" />
                    <label htmlFor={`active-${period.id}`} className="text-xs text-gray-600 select-none cursor-pointer">Currently Active</label>
                  </div>
                  {/* Location (required) */}
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-0.5">Location *</label>
                    <select value={period.locationId} onChange={e => updatePeriod(period.id, 'locationId', e.target.value)} className={inpSm}>
                      <option value="">Select location</option>
                      {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  {/* Block (required) */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Block *</label>
                    <select value={period.blockId} onChange={e => updatePeriod(period.id, 'blockId', e.target.value)} className={inpSm}>
                      <option value="">Select block</option>
                      {locBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  {/* Monthly Rent */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Monthly Rent (₱) *</label>
                    <input type="number" value={period.monthlyRent}
                      onChange={e => updatePeriod(period.id, 'monthlyRent', e.target.value)}
                      onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()}
                      className={inpSm} placeholder="e.g. 8000" min="1" />
                  </div>
                  {/* Unit selection (required) — show occupied status if isActive */}
                  {period.blockId && (
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">
                            Units <span className="text-blue-600">({period.unitIds?.length ?? 0} selected)</span>
                          </label>
                      <div className="flex flex-wrap gap-1.5">
                        {blockUnits.map(u => {
                          const occupierName = occupiedUnits.get(u.id);
                          const isOccupied = !!occupierName;
                          const isDisabled = isOccupied && period.isActive;
                          const isSelected = (period.unitIds ?? []).includes(u.id);
                          return (
                            <button key={u.id} type="button"
                              onClick={() => toggleUnit(period.id, u.id, isOccupied, period.isActive)}
                              disabled={isDisabled}
                              title={isOccupied ? `Taken by ${occupierName}` : `Unit ${u.number}`}
                              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                                isDisabled
                                  ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed line-through'
                                  : isSelected
                                    ? 'bg-blue-900 text-white border-blue-900'
                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'
                              }`}>
                              {u.number}{isOccupied && period.isActive ? ' ✗' : ''}
                            </button>
                          );
                        })}
                        {blockUnits.length === 0 && <span className="text-xs text-gray-400">No units in this block</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Transactions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Transactions ({period.transactions.length})</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => addTransaction(period.id, 'monthly')} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">+ Full</button>
                      <button onClick={() => addTransaction(period.id, 'downpayment')} className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200">+ Partial</button>
                      <button onClick={() => addTransaction(period.id, 'deposit_advance')} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">+ Advance</button>
                    </div>
                  </div>

                  {rentVal > 0 && totalPaid > 0 && (
                    <div className="text-xs text-gray-500 bg-white rounded px-2 py-1 border border-gray-200">
                      Monthly total: <span className={totalPaid >= rentVal ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>{fmt(totalPaid)}</span>
                      {totalPaid < rentVal && <span className="text-red-500 ml-1">(balance: {fmt(rentVal - totalPaid)})</span>}
                    </div>
                  )}

                  {period.transactions.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {period.transactions.map((tx, ti) => {
                        const parentTx = tx.parentId ? period.transactions.find(t => t.id === tx.parentId) : undefined;
                        const parentAmount = parentTx ? parseFloat(parentTx.amount) || 0 : 0;
                        const remainingAfterParent = Math.max(0, rentVal - parentAmount);
                        const advBalance = getFormAdvBalanceAt(tx.id);
                        const canUseAdvanceRemainder = tx.isFollowUp && parentTx?.type === 'downpayment' && remainingAfterParent > 0;
                        const isAdvanceRemainder = Boolean(tx.useAdvanceRemainder);
                        const advanceAmount = String(Math.min(remainingAfterParent, advBalance));

                        return (
                          <div key={tx.id} className={`border rounded-lg p-2.5 bg-white space-y-2 ${tx.isFollowUp ? 'border-orange-200 ml-4' : 'border-gray-200'}`} data-form>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-600">
                                {tx.isFollowUp ? '↳ Follow-up' : tx.type === 'monthly' ? 'Full Payment' : tx.type === 'downpayment' ? 'Partial' : tx.type === 'advance_used' ? 'Advance Used' : 'Advance Deposit'} #{ti + 1}
                              </span>
                              <button onClick={() => removeTransaction(period.id, tx.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                            </div>
                            {tx.isFollowUp && tx.useAdvanceRemainder && parentTx && (
                              <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-sm text-lime-800">
                                Combined payment: <strong>{fmt(parentAmount + (parseFloat(tx.amount) || 0))}</strong> — partial {fmt(parentAmount)} + advance cover {fmt(parseFloat(tx.amount) || 0)}
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              {/* SOA — hidden for follow-ups (inherited) */}
                              {!tx.isFollowUp && (
                                <div className="col-span-2">
                                  <label className="block text-xs text-gray-500 mb-0.5">Ref No. <span className="text-gray-400">(optional)</span></label>
                                  <input type="number" value={parseInt(tx.soa) || ''}
                                    onChange={e => updateTransaction(period.id, tx.id, 'soa', e.target.value)}
                                    onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()}
                                    className={inpSm} placeholder="e.g. 42" min="1" />
                                  {tx.soa && !isNaN(parseInt(tx.soa)) && parseInt(tx.soa) > 0 && (() => {
                                    const status = getFormSoaStatus(tx.soa, tx.isFollowUp);
                                    return status ? (
                                      <p className="text-xs text-red-500 mt-0.5">
                                        {status}
                                      </p>
                                    ) : null;
                                  })()}
                                </div>
                              )}
                              {tx.isFollowUp && (
                                <div className="col-span-2 text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
                                  SOA: {tx.soa || '—'} · Month: {tx.forMonth} (inherited from parent)
                                </div>
                              )}
                              {/* For Month — hidden for follow-ups */}
                              {!tx.isFollowUp && (
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">For Month</label>
                                  <MonthYearPicker value={tx.forMonth} onChange={v => updateTransaction(period.id, tx.id, 'forMonth', v)} className={inpSm} maxYear={maxYearInData} />
                                </div>
                              )}
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Date Paid</label>
                                <MdySelect value={tx.datePaid}
                                  onChange={v => updateTransaction(period.id, tx.id, 'datePaid', v)}
                                  className={inpSm}
                                  maxYear={maxYearInData} />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Method</label>
                                <select value={tx.method} onChange={e => updateTransaction(period.id, tx.id, 'method', e.target.value)}
                                  onKeyDown={enterToNext} className={inpSm}>
                                  {METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
                                </select>
                              </div>
                              {canUseAdvanceRemainder && (
                                <div className="col-span-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-gray-700">
                                  <label className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isAdvanceRemainder}
                                      disabled={advBalance <= 0}
                                      onChange={e => setUnitPeriods(prev => prev.map(p => {
                                        if (p.id !== period.id) return p;
                                        return {
                                          ...p,
                                          transactions: p.transactions.map(t => {
                                            if (t.id !== tx.id) return t;
                                            const useRemainder = e.target.checked;
                                            return {
                                              ...t,
                                              type: useRemainder ? 'advance_used' : 'downpayment',
                                              amount: useRemainder ? advanceAmount : t.amount,
                                              useAdvanceRemainder: useRemainder,
                                            };
                                          }),
                                        };
                                      }))}
                                      className="mt-1 h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                                    />
                                    <span className="text-xs">
                                      Use advance deposit balance to pay remaining {fmt(remainingAfterParent)}.
                                      {advBalance <= 0 ? <span className="block text-xs text-red-600">No stored advance available.</span> : advBalance < remainingAfterParent ? <span className="block text-xs text-yellow-700">Available {fmt(advBalance)}, will apply this amount.</span> : null}
                                    </span>
                                  </label>
                                </div>
                              )}
                              {tx.type === 'deposit_advance' && tx.depositMode === 'use' ? (
                                <div className="col-span-2">
                                  <label className="block text-xs text-gray-500 mb-0.5">Available Advance Balance</label>
                                  <div className="flex items-center gap-2 border border-yellow-300 rounded px-2 py-1 bg-yellow-50">
                                    <span className="text-xs font-semibold text-yellow-700">{fmt(getFormAdvBalanceAt(tx.id))}</span>
                                    <span className="text-xs text-yellow-600">→ uses {fmt(parseFloat(period.monthlyRent)||0)} (1 month rent)</span>
                                  </div>
                                </div>
                              ) : isAdvanceRemainder ? (
                                <div className="col-span-2">
                                  <label className="block text-xs text-gray-500 mb-0.5">Advance Used Amount</label>
                                  <input type="number" value={advanceAmount}
                                    disabled
                                    className={`${inpSm} bg-gray-100`} />
                                </div>
                              ) : (
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">Amount (₱)</label>
                                  <input type="number" value={tx.amount}
                                    onChange={e => updateTransaction(period.id, tx.id, 'amount', e.target.value)}
                                    onKeyDown={enterToNext} onWheel={e => (e.target as HTMLInputElement).blur()}
                                    className={inpSm} placeholder="Enter amount" />
                                </div>
                              )}
                              {/* Deposit mode radio — only for deposit_advance */}
                              {tx.type === 'deposit_advance' && (
                                <div className="col-span-2">
                                  <label className="block text-xs text-gray-500 mb-1">Advance type:</label>
                                  <div className="flex gap-3">
                                    {(['store', 'use'] as const).map(mode => (
                                      <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" name={`depMode-${tx.id}`} checked={tx.depositMode === mode || (!tx.depositMode && mode === 'store')}
                                          onChange={() => setUnitPeriods(prev => prev.map(p => p.id !== period.id ? p : {
                                            ...p, transactions: p.transactions.map(t => t.id !== tx.id ? t : { ...t, depositMode: mode })
                                          }))}
                                          className="accent-blue-900" />
                                        <span className="text-xs text-gray-600">{mode === 'store' ? 'Adding to stored balance' : 'Using stored advance'}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Follow-up payment button — for downpayment type */}
                            {tx.type === 'downpayment' && !tx.isFollowUp && (
                              <button onClick={() => addFollowUpTransaction(period.id, tx)}
                                className="w-full py-1 text-xs border border-dashed border-orange-300 text-orange-600 rounded hover:bg-orange-50">
                                + Follow-up Payment
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {period.transactions.length === 0 && (
                    <p className="text-xs text-gray-400 italic text-center py-2">No transactions yet.</p>
                  )}
                </div>

                <button onClick={() => duplicatePeriod(period)}
                  className="w-full py-1.5 border border-dashed border-blue-300 text-blue-600 text-xs rounded-lg hover:bg-blue-50 transition-colors">
                  ⧉ Duplicate this period (SOA resets)
                </button>
              </div>
            );
          })}
          {unitPeriods.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">Click "Add a Unit Transaction History" to start.</p>
          )}
        </div>
      </div>

      {err && <p className="text-red-500 text-sm">{err}</p>}
      {success && <p className="text-green-600 text-sm font-medium">{success}</p>}

      <button onClick={handleSave} className="w-full py-2.5 bg-blue-900 text-white rounded-xl text-sm font-medium hover:bg-blue-800">
        Save Past Lessee
      </button>
    </div>
  );
}

// ─── Account Tab ──────────────────────────────────────────────────────────────
const USERS_KEY = 'dbms_users';
function loadUsers(): Record<string, string> {
  try { const r = localStorage.getItem(USERS_KEY); return r ? JSON.parse(r) : { CommercialBLDG: 'camary' }; } catch { return { CommercialBLDG: 'camary' }; }
}
function saveUsersLocal(users: Record<string, string>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function AccountTab({ onSwitchAccount }: { onSwitchAccount: () => void }) {
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regErr, setRegErr] = useState('');
  const [regOk, setRegOk] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { ask, dialog: confirmDialog } = useConfirm();
  const users = loadUsers();
  const userList = Object.keys(users);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setRegErr(''); setRegOk('');
    if (!regUser.trim()) { setRegErr('Username is required.'); return; }
    if (regPass.length < 4) { setRegErr('Password must be at least 4 characters.'); return; }
    if (regPass !== regConfirm) { setRegErr('Passwords do not match.'); return; }
    if (users[regUser.trim()]) { setRegErr('Username already exists.'); return; }
    users[regUser.trim()] = regPass;
    saveUsersLocal(users);
    setRegOk(`User "${regUser.trim()}" created.`);
    setRegUser(''); setRegPass(''); setRegConfirm('');
  };

  const handleDelete = (username: string) => {
    if (username === sessionStorage.getItem('dbms_user')) { setRegErr('Cannot delete the currently logged-in user.'); return; }
    ask(`Delete user "${username}"?`, () => {
      const updated = { ...users };
      delete updated[username];
      saveUsersLocal(updated);
      setRegOk(`User "${username}" deleted.`);
    });
  };

  const inpA = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-1">Current Session</h4>
        <p className="text-sm text-gray-500">Logged in as <strong className="text-gray-700">{sessionStorage.getItem('dbms_user') ?? 'Unknown'}</strong></p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">System Users</h4>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {userList.map(u => (
            <div key={u} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700">{u}</span>
              {u !== sessionStorage.getItem('dbms_user') && (
                <button onClick={() => handleDelete(u)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/30">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Create New User</h4>
        <form onSubmit={handleCreate} className="space-y-3">
          <input value={regUser} onChange={e => { setRegUser(e.target.value); setRegErr(''); setRegOk(''); }}
            className={inpA} placeholder="New username" />
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={regPass}
              onChange={e => { setRegPass(e.target.value); setRegErr(''); }}
              className={`${inpA} pr-10`} placeholder="Password (min 4 chars)" />
            <button type="button" onClick={() => setShowPass(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
          <input type="password" value={regConfirm} onChange={e => { setRegConfirm(e.target.value); setRegErr(''); }}
            className={inpA} placeholder="Confirm password" />
          {regErr && <p className="text-red-500 text-xs">{regErr}</p>}
          {regOk && <p className="text-green-600 text-xs font-medium">{regOk}</p>}
          <button type="submit" className="w-full py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800">Create Account</button>
        </form>
      </div>

      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs text-gray-500"><strong>R.A. Del Rosario Construction</strong><br />Commercial Unit Management System · v1.0</p>
      </div>
      <button onClick={() => ask('Sign out and return to login?', onSwitchAccount)}
        className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
        Sign Out
      </button>
      {confirmDialog}
    </div>
  );
}

// ─── SOA Search Tab ──────────────────────────────────────────────────────────
const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtCur = (n: number) => `₱${n.toLocaleString()}`;
function SoaSearchTab({ data }: { data: AppData }) {
  const [soaSearch, setSoaSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const soaNum = parseInt(soaSearch.trim());
  const results = !isNaN(soaNum) && soaNum > 0
    ? data.payments.filter(p => p.soa === String(soaNum).padStart(4, '0'))
    : [];
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Search by Reference number</label>
        <input
          type="number"
          value={soaSearch}
          onChange={e => { setSoaSearch(e.target.value.replace(/[^0-9]/g, '')); setExpandedId(null); }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter reference number (numeric only)..."
          min="1"
          onWheel={e => (e.target as HTMLInputElement).blur()}
        />
      </div>
      {soaSearch.trim() && (
        <div className="space-y-1.5">
            {results.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">No transactions found for Ref No. #{soaSearch}.</p>
          ) : (
            results.map(p => {
              const lessee = data.lessees.find(l => l.id === p.lesseeId);
              const loc = lessee ? data.locations.find(l => l.id === lessee.locationId)?.name : '—';
              const block = lessee ? data.blocks.find(b => b.id === lessee.blockId)?.name : '—';
              const unit = lessee ? data.units.find(u => u.id === lessee.unitId)?.number : '—';
              const [fy, fm] = p.forMonth.split('-');
              const isExpanded = expandedId === p.id;
              return (
                <div key={p.id}
                  className={`border rounded-xl bg-white cursor-pointer transition-all select-none ${isExpanded ? 'border-blue-300 shadow-sm' : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'}`}
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                  {/* Compact row — always visible */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-blue-700 text-sm font-semibold">Ref No. #{p.soa}</span>
                      <span className="font-medium text-gray-800 text-sm">{lessee?.name ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{loc}</span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-blue-100 px-4 py-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-500">
                        <span>Date Paid: <strong className="text-gray-700">{p.date}</strong></span>
                        <span>For Month: <strong className="text-gray-700">{MONTHS_ABBR[parseInt(fm)-1]} {fy}</strong></span>
                        <span>Type: <strong className="text-gray-700 capitalize">{p.type.replace(/_/g,' ')}</strong></span>
                        <span>Method: <strong className="text-gray-700">{PAYMENT_METHOD_LABEL[p.method]}</strong></span>
                        <span>Amount: <strong className="text-green-700">{fmtCur(p.amount)}</strong></span>
                        <span>Total Due: <strong className="text-gray-700">{fmtCur(p.totalDue)}</strong></span>
                        <span>Location: <strong className="text-gray-700">{loc}</strong></span>
                        <span>Block/Unit: <strong className="text-gray-700">{block}, Unit {unit}</strong></span>
                        {lessee?.startDate && <span>Start Date: <strong className="text-gray-700">{lessee.startDate}</strong></span>}
                        {lessee?.endDate
                          ? <span>End Date: <strong className="text-gray-700">{lessee.endDate}</strong></span>
                          : <span>Status: <strong className="text-green-700">Active</strong></span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
      {!soaSearch.trim() && (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          Enter an SOA number above to search transactions
        </div>
      )}
    </div>
  );
}

// ─── Main Settings ────────────────────────────────────────────────────────────
export function Settings({ data, onUpdateData, onClose, onSwitchAccount }: Props) {
  const [tab, setTab] = useState<Tab>('locations');

  

  const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'locations', label: 'Locations', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { id: 'lessee-status', label: 'Lessee Status', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { id: 'past-lessee', label: 'Add Past Lessee', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> },
    { id: 'soa-search', label: 'Ref No. Search', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
    { id: 'account', label: 'Account', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-end">
      <div className="h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="bg-blue-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <h2 className="text-white font-semibold">Settings</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex border-b border-gray-200 flex-shrink-0 overflow-x-auto bg-white">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {tab === 'locations' && <LocationsTab data={data} onUpdateData={onUpdateData} />}
          {tab === 'lessee-status' && <LesseeStatusTab data={data} onUpdateData={onUpdateData} />}
          {tab === 'past-lessee' && <PastLesseeTab data={data} onUpdateData={onUpdateData} />}
          {tab === 'account' && <AccountTab onSwitchAccount={onSwitchAccount} />}
          {tab === 'soa-search' && <SoaSearchTab data={data} />}
        </div>
      </div>
    </div>
  );
}
