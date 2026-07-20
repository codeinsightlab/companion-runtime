export interface SingleInstanceApplication {
  requestSingleInstanceLock(): boolean;
  quit(): void;
}

export function acquireSingleInstanceLock(application: SingleInstanceApplication): boolean {
  const acquired = application.requestSingleInstanceLock();
  if (!acquired) application.quit();
  return acquired;
}
