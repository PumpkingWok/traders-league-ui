const balanceRefreshEventName = 'traders-league:balance-refresh';

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
