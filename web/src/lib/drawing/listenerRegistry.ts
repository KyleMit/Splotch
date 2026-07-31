type Remover = () => void;

export function listen<K extends keyof WindowEventMap>(
  removers: Remover[],
  target: Window,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions | boolean
): void;
export function listen<K extends keyof DocumentEventMap>(
  removers: Remover[],
  target: Document,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions | boolean
): void;
export function listen<K extends keyof HTMLElementEventMap>(
  removers: Remover[],
  target: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions | boolean
): void;
export function listen(
  removers: Remover[],
  target: EventTarget,
  type: string,
  handler: (event: Event) => void,
  options?: AddEventListenerOptions | boolean
): void;
export function listen(
  removers: Remover[],
  target: EventTarget,
  type: string,
  handler: (event: Event) => void,
  options?: AddEventListenerOptions | boolean
) {
  target.addEventListener(type, handler as EventListener, options);
  removers.push(() => target.removeEventListener(type, handler as EventListener, options));
}
