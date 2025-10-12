import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(
  value: number | null | undefined,
  { min = 0, max = 2, locale = undefined }: { min?: number; max?: number; locale?: string } = {}
): string {
  if (value == null || !Number.isFinite(value)) return "0";
  const abs = Math.abs(value);

  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max });

  if (abs >= 1_000_000_000) return nf.format(value / 1_000_000_000) + "B";
  if (abs >= 1_000_000)       return nf.format(value / 1_000_000) + "M";
  if (abs >= 1_000)           return nf.format(value / 1_000) + "k";
  return nf.format(value);
}


export function shortenAddress(address: string, startLength = 4, endLength = 4): string {
  if (!address) return '';
  
  // If the address is already short enough, return it as is.
  if (address.length <= startLength + endLength) {
    return address;
  }
  
  const start = address.slice(0, startLength);
  const end = address.slice(-endLength);
  
  return `${start}...${end}`;
}

