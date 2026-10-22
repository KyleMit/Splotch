export function forbidRequestStubs(target: object): void {
  for (const method of ['route', 'routeFromHAR', 'routeWebSocket']) {
    Object.defineProperty(target, method, {
      value: () => {
        throw new Error('Real-handler UI integration forbids request stubs');
      },
      configurable: false,
      writable: false,
    });
  }
}
