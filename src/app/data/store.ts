// Commercial Unit DBMS - Data Store
import { getApiUrl, getSharedImageUrl } from '../api/serverConfig';
import type { AppData, Block, Lessee, Location, Payment, Unit } from './types';

export const createEmptyAppData = (): AppData => ({
  locations: [],
  blocks: [],
  units: [],
  lessees: [],
  payments: [],
  sharedBackgroundImage: '',
});

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(getApiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const normalizeAutomaticMonthEntries = (data: AppData, referenceDate: Date = new Date()): AppData => {
  const currentMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
  const newPayments: Payment[] = [];

  for (const lessee of data.lessees) {
    if (!lessee.isActive) continue;

    const startMonth = lessee.startDate.slice(0, 7);
    const endMonth = lessee.endDate?.slice(0, 7);
    let cursor = startMonth;

    while (cursor < currentMonth) {
      if (endMonth && cursor > endMonth) break;

      const hasAnyEntry = data.payments.some(p => p.lesseeId === lessee.id && p.forMonth === cursor);
      const hasZeroEntry = data.payments.some(p => p.lesseeId === lessee.id && p.forMonth === cursor && p.amount === 0);

      if (!hasAnyEntry && !hasZeroEntry) {
        newPayments.push({
          id: generateId(),
          lesseeId: lessee.id,
          amount: 0,
          totalDue: lessee.monthlyRent,
          date: `${cursor}-01`,
          method: 'cash',
          type: 'monthly',
          forMonth: cursor,
          isComplete: false,
          notes: 'Auto-generated zero-payment record',
        });
      }

      const [year, month] = cursor.split('-').map(Number);
      const nextMonth = new Date(year, month, 1);
      cursor = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  return newPayments.length > 0 ? { ...data, payments: [...data.payments, ...newPayments] } : data;
};

export const loadData = async (): Promise<AppData> => {
  const data = await requestJson<AppData>('/api/data');
  return normalizeAutomaticMonthEntries({
    locations: (data.locations ?? []).map(location => ({
      ...location,
      imageUrl: getSharedImageUrl(location.imageUrl ?? ''),
    })),
    blocks: data.blocks ?? [],
    units: data.units ?? [],
    lessees: data.lessees ?? [],
    payments: data.payments ?? [],
    sharedBackgroundImage: getSharedImageUrl(data.sharedBackgroundImage ?? ''),
  });
};

export const saveData = async (data: AppData): Promise<void> => {
  const normalized = normalizeAutomaticMonthEntries(data);
  await requestJson('/api/data', {
    method: 'POST',
    body: JSON.stringify(normalized),
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
};

export const generateSOA = (existing: Lessee[]): string => {
  const nums = existing.map(l => parseInt(l.soa ?? '')).filter(n => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return String(max + 1).padStart(4, '0');
};

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const getMonthBounds = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(year, monthNumber - 1, 1),
    end: new Date(year, monthNumber, 0),
  };
};

export const isLesseeActiveForMonth = (lessee: Lessee, month: string): boolean => {
  const { start, end } = getMonthBounds(month);
  const startDate = parseDateOnly(lessee.startDate);
  const endDate = lessee.endDate ? parseDateOnly(lessee.endDate) : null;

  if (startDate > end) return false;
  if (endDate && endDate < start) return false;
  if (endDate && startDate > endDate) return false;

  return lessee.isActive || Boolean(endDate);
};

export const getTotalSalesForMonth = (
  lessees: Lessee[], month: string, locationId?: string
): number => {
  const target = locationId ? lessees.filter(l => l.locationId === locationId) : lessees;
  return target
    .filter(l => isLesseeActiveForMonth(l, month))
    .reduce((sum, l) => sum + l.monthlyRent, 0);
};

export const getMonthlyCollections = (
  payments: Payment[], lessees: Lessee[], month: string, locationId?: string
): number => {
  const relevantLessees = locationId
    ? lessees.filter(l => l.locationId === locationId)
    : lessees;
  const activeLesseeIds = new Set(
    relevantLessees.filter(l => isLesseeActiveForMonth(l, month)).map(l => l.id)
  );
  return payments
    .filter(p =>
      (p.type === 'monthly' || p.type === 'downpayment' || p.type === 'advance_used' || p.type === 'deposit_advance') &&
      p.forMonth === month &&
      activeLesseeIds.has(p.lesseeId)
    )
    .reduce((sum, p) => sum + p.amount, 0);
};

export const getTotalAdvanceDeposit = (
  payments: Payment[], lessees: Lessee[], locationId?: string
): number => {
  const lesseesInLoc = locationId
    ? new Set(lessees.filter(l => l.locationId === locationId).map(l => l.id))
    : null;
  return payments
    .filter(p =>
      p.type === 'deposit_advance' &&
      (!lesseesInLoc || lesseesInLoc.has(p.lesseeId))
    )
    .reduce((sum, p) => sum + p.amount, 0);
};

export const getLesseeMonthReceivable = (
  payments: Payment[], lessee: Lessee, month: string
): number => {
  if (!isLesseeActiveForMonth(lessee, month)) return 0;

  const collected = payments
    .filter(p => p.lesseeId === lessee.id && p.forMonth === month)
    .filter(p => (p.type === 'monthly' || p.type === 'downpayment' || p.type === 'advance_used') && p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0);

  return Math.max(0, lessee.monthlyRent - collected);
};

export const getMonthlyReceivables = (
  payments: Payment[], lessees: Lessee[], month: string, locationId?: string
): number => {
  const target = locationId ? lessees.filter(l => l.locationId === locationId) : lessees;
  return target.reduce((sum, lessee) => sum + getLesseeMonthReceivable(payments, lessee, month), 0);
};

/** Returns amount remaining in a lessee's stored advance bucket. */
export const getStoredAdvanceBalance = (payments: Payment[], lesseeId: string): number => {
  const deposited = payments
    .filter(p => p.lesseeId === lesseeId && p.type === 'deposit_advance')
    .reduce((s, p) => s + p.amount, 0);
  const used = payments
    .filter(p => p.lesseeId === lesseeId && p.type === 'advance_used')
    .reduce((s, p) => s + p.amount, 0);
  return Math.max(0, deposited - used);
};

export const getMethodBreakdown = (
  payments: Payment[], lessees: Lessee[], month: string, locationId?: string
): { cash: number; check: number; digital: number } => {
  const lesseesInLoc = locationId
    ? new Set(lessees.filter(l => l.locationId === locationId).map(l => l.id))
    : null;
  const relevant = payments.filter(p =>
    (p.type === 'monthly' || p.type === 'downpayment' || p.type === 'advance_used') &&
    p.forMonth === month &&
    (!lesseesInLoc || lesseesInLoc.has(p.lesseeId))
  );
  return {
    cash: relevant.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
    check: relevant.filter(p => p.method === 'check').reduce((s, p) => s + p.amount, 0),
    digital: relevant.filter(p => p.method === 'digital').reduce((s, p) => s + p.amount, 0),
  };
};

export const getDailyPayments = (
  payments: Payment[], lessees: Lessee[], year: number, month: number, locationId?: string
): Array<{ day: number; cash: number; check: number; digital: number; advanceDeposit: number }> => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const lesseesInLoc = locationId
    ? new Set(lessees.filter(l => l.locationId === locationId).map(l => l.id))
    : null;

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStr = `${monthStr}-${String(day).padStart(2, '0')}`;
    const dayPayments = payments.filter(p =>
      p.date === dayStr &&
      (!lesseesInLoc || lesseesInLoc.has(p.lesseeId))
    );
    return {
      day,
      cash: dayPayments.filter(p => p.method === 'cash' && p.type !== 'deposit_advance').reduce((s, p) => s + p.amount, 0),
      check: dayPayments.filter(p => p.method === 'check' && p.type !== 'deposit_advance').reduce((s, p) => s + p.amount, 0),
      digital: dayPayments.filter(p => p.method === 'digital' && p.type !== 'deposit_advance').reduce((s, p) => s + p.amount, 0),
      advanceDeposit: dayPayments.filter(p => p.type === 'deposit_advance').reduce((s, p) => s + p.amount, 0),
    };
  });
};

export const getMonthlyData = (
  payments: Payment[], lessees: Lessee[], year: number, locationId?: string
): Array<{ month: string; label: string; cash: number; check: number; digital: number; advanceDeposit: number; totalSales: number }> => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((label, i) => {
    const m = String(i + 1).padStart(2, '0');
    const monthStr = `${year}-${m}`;
    const lesseesInLoc = locationId
      ? new Set(lessees.filter(l => l.locationId === locationId).map(l => l.id))
      : null;
    const relevant = payments.filter(p =>
      p.forMonth === monthStr &&
      (!lesseesInLoc || lesseesInLoc.has(p.lesseeId))
    );
    return {
      month: monthStr,
      label,
      cash: relevant.filter(p => p.method === 'cash' && p.type !== 'deposit_advance').reduce((s, p) => s + p.amount, 0),
      check: relevant.filter(p => p.method === 'check' && p.type !== 'deposit_advance').reduce((s, p) => s + p.amount, 0),
      digital: relevant.filter(p => p.method === 'digital' && p.type !== 'deposit_advance').reduce((s, p) => s + p.amount, 0),
      advanceDeposit: relevant.filter(p => p.type === 'deposit_advance').reduce((s, p) => s + p.amount, 0),
      totalSales: getTotalSalesForMonth(lessees, monthStr, locationId),
    };
  });
};

/**
 * Get payment status for a lessee for a given month.
 * advance_used payments mark the month as paid via stored advance.
 * Legacy fallback handles old data that used monthsFromStart 0-2 convention.
 */
export const getLesseeMonthStatus = (
  payments: Payment[], lessee: Lessee, month: string
): { paid: number; totalDue: number; status: 'paid' | 'partial' | 'unpaid'; isAdvance: boolean; payments: Payment[] } => {
  if (!isLesseeActiveForMonth(lessee, month)) {
    return { paid: 0, totalDue: 0, status: 'unpaid', isAdvance: false, payments: [] };
  }

  const monthPayments = payments.filter(p => p.lesseeId === lessee.id && p.forMonth === month);
  const hasAdvanceUsed = monthPayments.some(p => p.type === 'advance_used');
  const isAdvance = hasAdvanceUsed;
  const regularPaid = monthPayments
    .filter(p => p.type === 'monthly' || p.type === 'downpayment')
    .reduce((s, p) => s + p.amount, 0);
  const totalDue = lessee.monthlyRent;
  const paid = isAdvance ? totalDue : regularPaid;
  const status: 'paid' | 'partial' | 'unpaid' = isAdvance
    ? 'paid'
    : regularPaid >= totalDue ? 'paid'
    : regularPaid > 0 ? 'partial'
    : 'unpaid';

  return { paid, totalDue, status, isAdvance, payments: monthPayments };
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  check: 'Check Payment',
  digital: 'e-Wallet/Bank Transfer',
};

export const getYearsWithData = (data: AppData): number[] => {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>([currentYear]);
  data.payments.forEach(p => {
    const y = parseInt(p.forMonth.split('-')[0]);
    if (!isNaN(y)) years.add(y);
  });
  data.lessees.forEach(l => {
    const sy = parseInt(l.startDate.split('-')[0]);
    if (!isNaN(sy)) years.add(sy);
    if (l.endDate) {
      const ey = parseInt(l.endDate.split('-')[0]);
      if (!isNaN(ey)) years.add(ey);
    }
  });
  const minYear = Math.min(...years, 2022);
  const maxYear = Math.max(...years, currentYear);
  return Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
};

const nextSOA = (payments: Payment[]): string => {
  const used = new Set(payments.map(p => parseInt(p.soa ?? '')).filter(n => !isNaN(n) && n > 0));
  let n = 1;
  while (used.has(n)) n++;
  return String(n).padStart(4, '0');
};

/**
 * Creates the advance deposit payment (stored bucket: 3 × monthlyRent).
 * If useForCurrentMonth = true, also creates a follow-up payment for startMonth.
 * By default it uses advance_used, but callers can request a regular monthly payment.
 */
export const createDepositPayments = (
  lesseeId: string,
  monthlyRent: number,
  amountPaid: number,
  method: import('./types').PaymentMethod,
  startMonth: string,
  existingPayments: Payment[] = [],
  useForCurrentMonth: boolean = false,
  currentMonthPaymentType: Payment['type'] = 'advance_used'
): Payment[] => {
  const soa = nextSOA(existingPayments);
  const today = new Date().toISOString().split('T')[0];
  const results: Payment[] = [{
    id: generateId(), lesseeId, soa,
    amount: amountPaid,
    totalDue: monthlyRent * 3,
    date: today, method,
    type: 'deposit_advance',
    forMonth: startMonth,
    isComplete: amountPaid >= monthlyRent * 3,
  }];

  if (useForCurrentMonth) {
    results.push({
      id: generateId(), lesseeId, soa,
      amount: monthlyRent,
      totalDue: monthlyRent,
      date: today, method,
      type: currentMonthPaymentType,
      forMonth: startMonth,
      isComplete: true,
    });
  }

  return results;
};
