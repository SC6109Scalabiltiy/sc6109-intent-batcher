export function formatUnits(value: bigint, decimals: bigint): string {
  const base = 10n ** decimals;
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) {
    return whole.toString();
  }

  const padded = fraction.toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return `${whole}.${padded}`;
}

export function units(amount: bigint, decimals: bigint): bigint {
  return amount * 10n ** decimals;
}

export function formatGas(value: bigint): string {
  return value.toLocaleString("en-US");
}

export function percentFromBps(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}%`;
}

export function stringifyBigints(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested),
    2
  );
}

export function csvEscape(value: string | number | bigint): string {
  const text = value.toString();
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

