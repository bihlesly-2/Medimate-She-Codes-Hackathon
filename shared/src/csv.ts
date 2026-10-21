import { STOCK_STATES, type StockState } from './constants';

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export const STOCK_CSV_HEADER = ['medicine', 'strength', 'form', 'price_xaf', 'stock_state', 'quantity'] as const;
export const STOCK_CSV_MAX_ROWS = 2000;
export const STOCK_CSV_MAX_BYTES = 512 * 1024;

export interface StockCsvRow {
  line: number;
  medicine: string;
  strength: string;
  form: string;
  price: number | null;
  stockState: StockState;
  quantity: number | null;
}
export interface CsvIssue {
  line: number;
  message: string;
}

const STATE_ALIASES: Record<string, StockState> = {
  in_stock: 'in_stock',
  'in stock': 'in_stock',
  instock: 'in_stock',
  available: 'in_stock',
  low: 'low',
  out: 'out',
  'out of stock': 'out',
  out_of_stock: 'out',
  unknown: 'unknown',
  '': 'unknown',
};

/** Structural validation of a pharmacy stock CSV. Catalogue matching happens on the server. */
export function validateStockCsv(text: string): { rows: StockCsvRow[]; issues: CsvIssue[] } {
  const issues: CsvIssue[] = [];
  if (text.length > STOCK_CSV_MAX_BYTES) return { rows: [], issues: [{ line: 0, message: 'File is larger than 512 KB.' }] };
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], issues: [{ line: 0, message: 'The file is empty.' }] };
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = STOCK_CSV_HEADER.filter((h) => !header.includes(h));
  if (missing.length) {
    return { rows: [], issues: [{ line: 1, message: `Missing column(s): ${missing.join(', ')}. Expected: ${STOCK_CSV_HEADER.join(',')}` }] };
  }
  const idx = (name: string) => header.indexOf(name);
  const body = table.slice(1);
  if (body.length > STOCK_CSV_MAX_ROWS) {
    return { rows: [], issues: [{ line: 0, message: `Too many rows (max ${STOCK_CSV_MAX_ROWS}).` }] };
  }
  const rows: StockCsvRow[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (name: string) => (cells[idx(name)] ?? '').trim();
    const medicine = get('medicine');
    const priceRaw = get('price_xaf').replace(/\s/g, '');
    const stateRaw = get('stock_state').toLowerCase();
    const qtyRaw = get('quantity');
    const rowIssues: string[] = [];
    if (!medicine || medicine.length > 80) rowIssues.push('medicine name is required (max 80 characters)');
    let price: number | null = null;
    if (priceRaw !== '') {
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(priceRaw)) rowIssues.push('price_xaf must be a number like 500 or 1250.50');
      else price = Number(priceRaw);
    }
    const stockState = STATE_ALIASES[stateRaw];
    if (!stockState) rowIssues.push(`stock_state must be one of: ${STOCK_STATES.join(', ')}`);
    let quantity: number | null = null;
    if (qtyRaw !== '') {
      if (!/^\d{1,7}$/.test(qtyRaw)) rowIssues.push('quantity must be a whole number');
      else quantity = Number(qtyRaw);
    }
    if (rowIssues.length) issues.push({ line, message: rowIssues.join('; ') });
    else rows.push({ line, medicine, strength: get('strength'), form: get('form'), price, stockState: stockState!, quantity });
  });
  return { rows, issues };
}
