import { randomBytes } from 'crypto';

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const addYears = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
};

export const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const daysBetween = (a: Date, b: Date): number =>
  Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

export function ref(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function secureToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

export function memberNumber(): string {
  return `MEM-${randomBytes(3).toString('hex').toUpperCase()}`;
}
