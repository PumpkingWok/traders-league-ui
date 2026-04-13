import { type Address } from 'viem';

export function formatDuration(hours: number) {
  if (hours < 24) return `${hours} Hour${hours === 1 ? '' : 's'}`;

  const days = hours / 24;
  if (Number.isInteger(days)) return `${days} Day${days === 1 ? '' : 's'}`;

  return `${hours} Hours`;
}

export function formatDurationFromSeconds(durationInSeconds: bigint) {
  const oneHour = 3600n;
  const oneDay = 86400n;
  const oneWeek = 604800n;

  if (durationInSeconds >= oneWeek && durationInSeconds % oneWeek === 0n) {
    const weeks = durationInSeconds / oneWeek;
    return `${weeks.toString()} Week${weeks === 1n ? '' : 's'}`;
  }

  if (durationInSeconds >= oneDay && durationInSeconds % oneDay === 0n) {
    const days = durationInSeconds / oneDay;
    return `${days.toString()} Day${days === 1n ? '' : 's'}`;
  }

  if (durationInSeconds >= oneHour && durationInSeconds % oneHour === 0n) {
    const hours = durationInSeconds / oneHour;
    return `${hours.toString()} Hour${hours === 1n ? '' : 's'}`;
  }

  return `${durationInSeconds.toString()}s`;
}

export function compactNumber(value: string) {
  if (!value.includes('.')) return value;
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

export function formatAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatSpotPriceLabel(value: bigint | null | undefined, decimals: number | null | undefined) {
  if (value === null || value === undefined || decimals === null || decimals === undefined) return '...';
  if (value === 0n) return '0';

  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  const decimalText = fractionText ? `${whole.toString()}.${fractionText}` : whole.toString();

  return `$${decimalText}`;
}
