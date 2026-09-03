export type PaymentMethod = 'cash' | 'check' | 'digital';
export type PaymentType = 'monthly' | 'deposit_advance' | 'downpayment' | 'advance_used';
export type Section = 'dashboard' | 'sales' | 'lessees' | 'history';

export interface Location {
  id: string;
  name: string;
  imageUrl: string;
}

export interface Block {
  id: string;
  locationId: string;
  name: string; // block name (e.g. 'A' or 'BLK1')
  order: number;
}

export interface Unit {
  id: string;
  blockId: string;
  number: string;
  order: number;
}

/**
 * Records one unit-assignment period for a lessee.
 * SQL equivalent: CREATE TABLE unit_history (id, lessee_id FK, block_id FK,
 *   unit_id FK, location_id FK, monthly_rent, date_joined, date_left)
 */
export interface UnitHistoryEntry {
  blockId: string;
  unitId: string;
  locationId: string;
  monthlyRent: number;
  dateJoined: string;
  dateLeft?: string;
}

/**
 * SQL equivalent: CREATE TABLE lessees (id PK, name, soa 4-char NULLABLE,
 *   unit_id FK, unit_ids JSON NULLABLE, block_id FK, location_id FK,
 *   monthly_rent, start_date, end_date, is_active, has_deposit_advance, deposit_amount)
 */
export interface Lessee {
  id: string;
  name: string;
  soa?: string;           // 4-digit, optional
  unitId: string;         // primary unit
  unitIds?: string[];     // all units when lessee occupies multiple units
  blockId: string;
  locationId: string;
  monthlyRent: number;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  hasDepositAdvance: boolean;
  depositAmount?: number;
  unitHistory?: UnitHistoryEntry[];
}

/**
 * SQL equivalent: CREATE TABLE payments (id PK, lessee_id FK, amount,
 *   total_due, date, method ENUM, type ENUM, for_month YYYY-MM, is_complete, notes)
 */
/**
 * SQL equivalent: CREATE TABLE payments (id PK, lessee_id FK, soa 4-char,
 *   amount, total_due, date, method ENUM, type ENUM, for_month YYYY-MM,
 *   is_complete, notes)
 * SOA is per-transaction (all partials for same lessee+month share one SOA).
 */
export interface Payment {
  id: string;
  lesseeId: string;
  soa?: string;       // Statement of Account number — per transaction, not per lessee
  amount: number;
  totalDue: number;
  date: string;
  method: PaymentMethod;
  type: PaymentType;
  forMonth: string; // YYYY-MM
  isComplete: boolean;
  notes?: string;
}

export interface AppData {
  locations: Location[];
  blocks: Block[];
  units: Unit[];
  lessees: Lessee[];
  payments: Payment[];
  sharedBackgroundImage?: string;
}
