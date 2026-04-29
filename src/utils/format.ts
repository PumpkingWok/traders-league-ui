import { type Address } from 'viem';

export function formatDuration(hours: number) {
  if (hours < 24) return `${hours} Hour${hours === 1 ? '' : 's'}`;

  const days = hours / 24;
  if (Number.isInteger(days)) return `${days} Day${days === 1 ? '' : 's'}`;

  return `${hours} Hours`;
}

export function formatDurationFromSeconds(durationInSeconds: bigint) {
  const oneMinute = 60n;
  const oneHour = 3600n;
  const oneDay = 86400n;
  const oneWeek = 604800n;

  if (durationInSeconds <= 0n) return '0s';

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

  if (durationInSeconds >= oneMinute && durationInSeconds < oneHour && durationInSeconds % oneMinute === 0n) {
    const minutes = durationInSeconds / oneMinute;
    return `${minutes.toString()} Min${minutes === 1n ? '' : 's'}`;
  }

  const days = durationInSeconds / oneDay;
  const hours = (durationInSeconds % oneDay) / oneHour;
  const minutes = (durationInSeconds % oneHour) / oneMinute;
  const seconds = durationInSeconds % oneMinute;
  const parts: string[] = [];

  if (days > 0n) parts.push(`${days.toString()}d`);
  if (hours > 0n) parts.push(`${hours.toString()}h`);
  if (minutes > 0n) parts.push(`${minutes.toString()}m`);
  if (seconds > 0n) parts.push(`${seconds.toString()}s`);

  return parts.slice(0, 2).join(' ');
}

export function compactNumber(value: string, maxFractionDigits?: number) {
  if (!value.includes('.')) return value;

  const [wholePart, fractionPart] = value.split('.');
  const trimmedFraction = fractionPart.replace(/0+$/, '');
  if (!trimmedFraction) return wholePart;

  if (maxFractionDigits === undefined) return `${wholePart}.${trimmedFraction}`;
  if (maxFractionDigits <= 0) return wholePart;

  const limitedFraction = trimmedFraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return limitedFraction ? `${wholePart}.${limitedFraction}` : wholePart;
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

export function formatUnixSecondsUtc(timestampSeconds: bigint | number | null | undefined) {
  if (timestampSeconds === null || timestampSeconds === undefined) return '-';
  const seconds = typeof timestampSeconds === 'bigint' ? Number(timestampSeconds) : timestampSeconds;
  if (!Number.isFinite(seconds)) return '-';

  const date = new Date(Math.trunc(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return '-';

  return `${date.toISOString().replace('T', ' ').replace('.000Z', '')} UTC`;
}
