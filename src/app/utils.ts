import type { AppData, Lessee, Payment } from './data/types';

/**
 * Moves focus to the next focusable input/select within the nearest form or
 * [data-form] container when Enter is pressed on a field.
 * Attach as onKeyDown on any input or select element.
 */
export function enterToNext(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Enter') return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'BUTTON' || tag === 'TEXTAREA') return;
  e.preventDefault();
  const container =
    (e.currentTarget as HTMLElement).closest('form, [data-form]') ?? document.body;
  const els = Array.from(
    container.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled])'
    )
  ) as HTMLElement[];
  const idx = els.indexOf(e.currentTarget as HTMLElement);
  if (idx >= 0 && idx < els.length - 1) els[idx + 1].focus();
}

/**
 * Generates the next available SOA number from existing payment records.
 * Finds the lowest unused positive integer, enabling recycling of deleted SOAs.
 * SQL equivalent: SELECT MIN(n) FROM generate_series(1, ...) WHERE n NOT IN (SELECT CAST(soa AS INT) FROM payments)
 */
export function generatePaymentSOA(payments: Payment[]): string {
  const used = new Set(
    payments
      .map(p => parseInt(p.soa ?? ''))
      .filter(n => !isNaN(n) && n > 0)
  );
  let n = 1;
  while (used.has(n)) n++;
  return String(n).padStart(4, '0');
}

/**
 * Gets or creates the SOA for a lessee's monthly transaction.
 * All payments for the same lessee+month share one SOA (they form one transaction).
 */
export function getOrCreateTransactionSOA(
  payments: Payment[],
  lesseeId: string,
  forMonth: string
): string {
  const existing = payments.find(p => p.lesseeId === lesseeId && p.forMonth === forMonth && p.soa);
  return existing?.soa ?? generatePaymentSOA(payments);
}

export interface LesseeBlockUnitGroup {
  blockId: string;
  blockName: string;
  units: string[];
}

export function getLesseeBlockUnitGroups(data: AppData, lessee: Lessee): LesseeBlockUnitGroup[] {
  const map = new Map<string, LesseeBlockUnitGroup>();

  const addGroup = (blockId: string, unitId?: string) => {
    const block = data.blocks.find(b => b.id === blockId);
    if (!block) return;

    if (!map.has(block.id)) {
      map.set(block.id, { blockId: block.id, blockName: block.name, units: [] });
    }

    if (!unitId) return;

    const unit = data.units.find(u => u.id === unitId);
    if (!unit) return;

    const group = map.get(block.id)!;
    if (!group.units.includes(unit.number)) group.units.push(unit.number);
  };

  if (lessee.blockId) addGroup(lessee.blockId);

  const currentUnitIds = [...new Set([lessee.unitId, ...(lessee.unitIds ?? [])].filter(Boolean))];
  currentUnitIds.forEach(uid => {
    const unit = data.units.find(u => u.id === uid);
    if (unit) addGroup(unit.blockId, uid);
  });

  (lessee.unitHistory ?? []).forEach(entry => {
    addGroup(entry.blockId, entry.unitId || undefined);
  });

  return [...map.values()].sort((a, b) => a.blockName.localeCompare(b.blockName));
}
