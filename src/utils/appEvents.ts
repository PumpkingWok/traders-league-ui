const balanceRefreshEventName = 'traders-league:balance-refresh';
const matchCreatedEventName = 'traders-league:match-created';

export function emitBalanceRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(balanceRefreshEventName));
}

export function addBalanceRefreshListener(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(balanceRefreshEventName, listener);
  return () => {
    window.removeEventListener(balanceRefreshEventName, listener);
  };
}

export type MatchCreatedEventDetail = {
  chainId: number;
  contractAddress: string;
  transactionHash: string;
};

export function emitMatchCreated(detail: MatchCreatedEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MatchCreatedEventDetail>(matchCreatedEventName, { detail }));
}

export function addMatchCreatedListener(
  listener: (detail: MatchCreatedEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const wrappedListener = (event: Event) => {
    const customEvent = event as CustomEvent<MatchCreatedEventDetail>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(matchCreatedEventName, wrappedListener as EventListener);
  return () => {
    window.removeEventListener(matchCreatedEventName, wrappedListener as EventListener);
  };
}
