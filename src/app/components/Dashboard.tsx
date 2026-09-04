import { useState, useEffect, useRef } from 'react';
import type { AppData } from '../data/types';
import {
  getTotalSalesForMonth, getMonthlyCollections,
  getMethodBreakdown, getYearsWithData, PAYMENT_METHOD_LABEL,
  isLesseeActiveForMonth, getLesseeRentForMonth, getMonthlyReceivables,
} from '../data/store';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n: number) => `₱${n.toLocaleString()}`;
const fmtReceivable = (n: number) => n < 0 ? `+${fmt(Math.abs(n))}` : fmt(n);
interface Props { data: AppData; bgImages: string[] }

type ChartEntry = { name: string; cash: number; check: number; digital: number; advance: number; receivables: number; totalSales: number };

function getMonthlyChartData(data: AppData, locId: string, year: number): ChartEntry[] {
  const today = new Date();
  const locLessees = data.lessees.filter(l => l.locationId === locId);
  return MONTHS_SHORT.map((label, i) => {
    const m = String(i + 1).padStart(2, '0');
    const monthStr = `${year}-${m}`;
    const monthStart = new Date(year, i, 1);
    const isFuture = monthStart > today;
    const active = locLessees.filter(l => isLesseeActiveForMonth(l, monthStr));
    if (active.length === 0) return null;

    const methods = getMethodBreakdown(data.payments, locLessees, monthStr, locId);
    const advance = data.payments
      .filter(p => p.forMonth === monthStr && p.type === 'deposit_advance' && locLessees.some(l => l.id === p.lesseeId))
      .reduce((s, p) => s + p.amount, 0);
    const totalSales = getTotalSalesForMonth(locLessees, monthStr, locId, data.payments);
    const receivables = isFuture ? 0 : getMonthlyReceivables(data.payments, locLessees, monthStr, locId);

    return {
      name: label,
      cash: methods.cash,
      check: methods.check,
      digital: methods.digital,
      advance,
      receivables,
      totalSales,
    };
  }).filter(Boolean) as ChartEntry[];
}

function getAllYearsChartData(data: AppData, locId: string, years: number[]): ChartEntry[] {
  const today = new Date();
  const locLessees = data.lessees.filter(l => l.locationId === locId);
  return years.map(year => {
    if (!locLessees.some(l => isLesseeActiveForMonth(l, `${year}-01`) || isLesseeActiveForMonth(l, `${year}-12`))) return null;

    let cash = 0;
    let check = 0;
    let digital = 0;
    let advance = 0;
    let totalSales = 0;
    let receivables = 0;

    for (let mi = 0; mi < 12; mi++) {
      const mS = new Date(year, mi, 1);
      if (mS > today) break;
      const monthStr = `${year}-${String(mi + 1).padStart(2, '0')}`;
      const active = locLessees.filter(l => isLesseeActiveForMonth(l, monthStr));
      if (active.length === 0) continue;

      const methods = getMethodBreakdown(data.payments, locLessees, monthStr, locId);
      cash += methods.cash;
      check += methods.check;
      digital += methods.digital;
      advance += data.payments
        .filter(p => p.forMonth === monthStr && p.type === 'deposit_advance' && locLessees.some(l => l.id === p.lesseeId))
        .reduce((s, p) => s + p.amount, 0);
      totalSales += getTotalSalesForMonth(locLessees, monthStr, locId, data.payments);
      receivables += getMonthlyReceivables(data.payments, locLessees, monthStr, locId);
    }

    return { name: String(year), cash, check, digital, advance, receivables, totalSales };
  }).filter(Boolean) as ChartEntry[];
}

const MAIN_LAYERS = [
  { key: 'cash' as const,        color: '#22c55e', label: 'Cash' },
  { key: 'check' as const,       color: '#3b82f6', label: 'Check' },
  { key: 'digital' as const,     color: '#8b5cf6', label: 'e-Wallet' },
  { key: 'receivables' as const, color: '#f87171', label: 'Receivables' },
];
const ADV_LAYER = { key: 'advance' as const, color: '#f59e0b', label: 'Adv. Deposit' };

interface TooltipState { x: number; y: number; entry: ChartEntry }

function StackedBarChart({
  data, locId, onClickLabel,
}: { data: ChartEntry[]; locId: string; onClickLabel: (label: string) => void }) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgW, setSvgW] = useState(700);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSvgW(Math.max(el.clientWidth, 100));
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSvgW(Math.max(Math.floor(e.contentRect.width), 100));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data.length) return null;

  const PL = 8, PR = 8, PT = 8, PB = 26;
  const VW = svgW, VH = 220;
  const CW = VW - PL - PR, CH = VH - PT - PB;

  const maxVal = Math.max(
    ...data.map(d => d.cash + d.check + d.digital + d.receivables),
    ...data.map(d => d.advance),
    1,
  );
  const rounded = Math.ceil(maxVal / 5000) * 5000 || 10000;

  const colW = CW / data.length;
  const barW = Math.max(colW * 0.32, 4);
  const GAP = 3;
  const totalBarW = barW * 2 + GAP;
  const toH = (v: number) => (v / rounded) * CH;

  const yTicks = [0.25, 0.5, 0.75, 1].map(t => Math.round(rounded * t));

  return (
    <div ref={containerRef} className="relative w-full" style={{ cursor: 'pointer' }}>
      <svg
        width={VW}
        height={VH}
        style={{ display: 'block' }}
        onMouseLeave={() => setTip(null)}
      >
        {/* Grid lines only — no Y-axis labels */}
        {yTicks.map(v => {
          const y = PT + CH - toH(v);
          return (
            <line key={`y-${locId}-${v}`} x1={PL} y1={y} x2={PL + CW} y2={y} stroke="#f0f0f0" strokeWidth={1} />
          );
        })}

        {/* Bars */}
        {data.map((entry, di) => {
          const cx = PL + di * colW + colW / 2;
          const mainBx = cx - totalBarW / 2;
          const advBx = mainBx + barW + GAP;
          let cumH = 0;
          return (
            <g
              key={`g-${locId}-${di}`}
              onClick={() => onClickLabel(entry.name)}
              onMouseEnter={() => setTip({ x: cx, y: PT, entry })}
            >
              {/* Main stacked bars: cash / check / digital / receivables */}
              {MAIN_LAYERS.map(layer => {
                const val = entry[layer.key] as number;
                const h = toH(val);
                if (h < 0.5) return null;
                const barY = PT + CH - cumH - h;
                cumH += h;
                const isTop = layer.key === 'receivables';
                return (
                  <rect
                    key={`r-${locId}-${di}-${layer.key}`}
                    x={mainBx} y={barY} width={barW} height={h}
                    fill={layer.color}
                    rx={isTop ? 2 : 0} ry={isTop ? 2 : 0}
                  />
                );
              })}
              {/* Advance deposit — separate adjacent bar */}
              {(() => {
                const advH = toH(entry.advance);
                if (advH < 0.5) return null;
                return (
                  <rect
                    key={`r-${locId}-${di}-advance`}
                    x={advBx} y={PT + CH - advH} width={barW} height={advH}
                    fill={ADV_LAYER.color}
                    rx={2} ry={2}
                  />
                );
              })()}
              {/* X label */}
              <text x={cx} y={VH - 6} textAnchor="middle" fontSize={10} fontWeight="500" fill="#374151" style={{ userSelect: 'none' }}>{entry.name}</text>
            </g>
          );
        })}

        {/* Baseline */}
        <line x1={PL} y1={PT + CH} x2={PL + CW} y2={PT + CH} stroke="#e5e7eb" strokeWidth={1} />
      </svg>

      {/* Tooltip */}
      {tip && (
        <div
          className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs pointer-events-none"
          style={{ left: `${(tip.x / VW) * 100}%`, top: '8px', transform: 'translateX(-50%)' }}
        >
          <p className="font-semibold text-gray-700 mb-1.5">{tip.entry.name}</p>
          {[...MAIN_LAYERS, ADV_LAYER].filter(l => (tip.entry[l.key] as number) > 0).map(l => (
            <div key={l.key} className="flex justify-between gap-4">
              <span style={{ color: l.color }}>{l.label}</span>
              <span className="font-medium">{fmt(tip.entry[l.key] as number)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const Card = ({ label, value, sub, color, valueClass }: { label: string; value: string; sub?: string; color: string; valueClass?: string }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-xl border-l-4 p-4 shadow-sm ${color}`}>
    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
    <p className={`text-xl font-bold mt-1 ${valueClass ?? 'text-gray-800 dark:text-gray-100'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const CHART_LEGEND = (
  <div className="flex flex-wrap gap-2 text-xs">
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500" />Cash</span>
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500" />Check</span>
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-500" />e-Wallet</span>
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400" />Receivables</span>
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500" />Advance</span>
  </div>
);

interface LocSectionProps {
  data: AppData; locId: string; locName: string;
  year: number; viewMode: 'monthly' | 'all-years'; allYears: number[];
  isOpen: boolean; onToggle: () => void;
}

function LocationSection({ data, locId, locName, year, viewMode, allYears, isOpen, onToggle }: LocSectionProps) {
  // Each location section has its own summaryMonth state — clicking a bar only updates this location
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [summaryMonth, setSummaryMonth] = useState(defaultMonth);

  const periodActiveLessees = data.lessees.filter(l => l.locationId === locId && isLesseeActiveForMonth(l, summaryMonth));
  const currentActiveLessees = data.lessees.filter(l => l.locationId === locId && l.isActive);
  const activeLesseeIds = new Set(periodActiveLessees.map(l => l.id));
  const totalSales = periodActiveLessees.reduce((s, l) => s + getLesseeRentForMonth(data.payments, l, summaryMonth), 0);
  const monthlyCollections = getMonthlyCollections(data.payments, data.lessees, summaryMonth, locId);
  const receivables = getMonthlyReceivables(data.payments, data.lessees, summaryMonth, locId);
  const advanceDepositMonth = data.payments
    .filter(p => p.forMonth === summaryMonth && p.type === 'deposit_advance' && activeLesseeIds.has(p.lesseeId))
    .reduce((s, p) => s + p.amount, 0);
  const totalIncome = totalSales + advanceDepositMonth;
  const unpaidCount = currentActiveLessees.filter(l => {
    const hasAdvPay = data.payments.some(p => p.lesseeId === l.id && p.forMonth === summaryMonth && (p.type === 'deposit_advance' || p.type === 'advance_used'));
    if (hasAdvPay && data.payments.some(p => p.lesseeId === l.id && p.forMonth === summaryMonth && p.type === 'advance_used')) return false;
    const paid = data.payments.filter(p => p.lesseeId === l.id && p.forMonth === summaryMonth && p.type !== 'deposit_advance').reduce((s, p) => s + p.amount, 0);
    return paid < getLesseeRentForMonth(data.payments, l, summaryMonth);
  }).length;

  const locLessees = data.lessees.filter(l => l.locationId === locId);
  const methods = getMethodBreakdown(data.payments, locLessees, summaryMonth, locId);

  const handleBarClick = (label: string) => {
    const mi = MONTHS_SHORT.indexOf(label);
    if (mi >= 0) setSummaryMonth(`${year}-${String(mi + 1).padStart(2, '0')}`);
  };

  const chartData = viewMode === 'monthly' ? getMonthlyChartData(data, locId, year) : getAllYearsChartData(data, locId, allYears);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 bg-blue-900 hover:bg-blue-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white text-sm font-bold">{locName.charAt(0)}</div>
          <h3 className="text-white font-semibold">{locName}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-200 text-xs hidden sm:block">{currentActiveLessees.length} active</span>
          <svg className={`w-5 h-5 text-blue-200 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Showing: <strong className="text-blue-700">{MONTHS_SHORT[parseInt(summaryMonth.split('-')[1]) - 1]} {summaryMonth.split('-')[0]}</strong></span>
            <button onClick={() => setSummaryMonth(defaultMonth)}
              className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Reset to current</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card label="Total Sales" value={fmt(totalSales)} sub={`Expected — ${MONTHS_SHORT[parseInt(summaryMonth.split('-')[1])-1]}`} color="border-blue-500" />
            <Card label="Advance Deposit" value={fmt(advanceDepositMonth)} sub="This month's advance" color="border-amber-500" />
            <Card label="Total Income" value={fmt(totalIncome)} sub="Sales + Advance" color="border-purple-500" />
            <Card label="Monthly Collections" value={fmt(monthlyCollections)} sub={`${totalSales > 0 ? ((monthlyCollections / totalSales) * 100).toFixed(1) : 0}% collected`} color="border-emerald-500" />
            <Card label="Receivables" value={fmtReceivable(receivables)} sub={`${totalSales > 0 ? ((receivables / totalSales) * 100).toFixed(1) : 0}% uncollected`} color="border-rose-500" valueClass={receivables < 0 ? 'text-green-700' : undefined} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 flex items-center gap-3">
              <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{currentActiveLessees.length}</span>
              <span className="text-sm text-blue-600 dark:text-blue-400">Active Lessees</span>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 flex items-center gap-3">
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">{unpaidCount}</span>
              <span className="text-sm text-red-500 dark:text-red-400">Not Paid This Month</span>
            </div>
            {(['cash','check','digital'] as const).map((mk, i) => {
              const vals = [methods.cash, methods.check, methods.digital];
              const colors = ['text-green-600 bg-green-50 dark:bg-green-900/20','text-blue-600 bg-blue-50 dark:bg-blue-900/20','text-purple-600 bg-purple-50 dark:bg-purple-900/20'];
              return (
                <div key={mk} className={`rounded-lg p-3 ${colors[i]}`}>
                  <div className="text-xs font-medium truncate">{PAYMENT_METHOD_LABEL[mk]}</div>
                  <div className="text-sm font-bold">{fmt(vals[i])}</div>
                  <div className="text-xs opacity-70">{monthlyCollections > 0 ? ((vals[i] / monthlyCollections) * 100).toFixed(1) : 0}%</div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {viewMode === 'monthly' ? `Monthly Collections — ${year}` : 'All Years Overview'}
              </p>
              {CHART_LEGEND}
            </div>
            {chartData.length > 0 ? (
              <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-blue-900/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                <StackedBarChart data={chartData} locId={locId} onClickLabel={handleBarClick} />
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400 text-sm bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                No lessee data for this period
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Dashboard({ data, bgImages }: Props) {
  const [bgIdx, setBgIdx] = useState(0);
  const [year, setYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<'monthly' | 'all-years'>('monthly');
  const [openLocs, setOpenLocs] = useState<Set<string>>(() => new Set(data.locations.map(l => l.id)));

  useEffect(() => {
    if (bgImages.length <= 1) return;
    const iv = setInterval(() => setBgIdx(i => (i + 1) % bgImages.length), 5000);
    return () => clearInterval(iv);
  }, [bgImages.length]);

  const years = getYearsWithData(data);

  useEffect(() => {
    if (!years.includes(year)) {
      setYear(years[years.length - 1] ?? new Date().getFullYear());
    }
  }, [years, year]);

  const toggleLoc = (locId: string) => {
    setOpenLocs(prev => {
      const next = new Set(prev);
      next.has(locId) ? next.delete(locId) : next.add(locId);
      return next;
    });
  };

  return (
    <div className="relative min-h-screen">
      {bgImages.map((img, i) => (
        <div key={i} className="fixed inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 pointer-events-none"
          style={{ backgroundImage: `url(${img})`, opacity: i === bgIdx ? 0.07 : 0, zIndex: 0 }} />
      ))}

      <div className="relative z-10 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h2>
            <p className="text-xs text-gray-400">R.A. Del Rosario Construction</p>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'monthly' && (
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <button onClick={() => setViewMode(v => v === 'monthly' ? 'all-years' : 'monthly')}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${viewMode === 'all-years' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white dark:bg-gray-800 dark:text-gray-100 text-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50'}`}>
              {viewMode === 'monthly' ? 'All Years View' : 'Monthly View'}
            </button>
          </div>
        </div>

        {data.locations.map(loc => (
          <LocationSection key={loc.id} data={data} locId={loc.id} locName={loc.name}
            year={year} viewMode={viewMode} allYears={years}
            isOpen={openLocs.has(loc.id)} onToggle={() => toggleLoc(loc.id)} />
        ))}

        {data.locations.length === 0 && (
          <div className="text-center py-16 text-gray-400">No locations. Add one in Settings.</div>
        )}
      </div>
    </div>
  );
}
