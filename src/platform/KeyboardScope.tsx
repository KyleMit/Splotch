import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  requireNativeComponent,
  StyleSheet,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';

type ShortcutKey = 'undo' | 'escape';
type ShortcutScope = 'drawing' | 'modal';
type ShortcutEvent = NativeSyntheticEvent<Readonly<{ key: unknown }>>;
type ReceiverProps = ViewProps & {
  shortcutScope: ShortcutScope;
  shortcutsEnabled: boolean;
  onShortcutKey: (event: ShortcutEvent) => void;
};

function createShortcutCommands() {
  const listeners: Record<ShortcutKey, Set<() => void>> = {
    undo: new Set(),
    escape: new Set(),
  };
  return {
    register(key: ShortcutKey, action: () => void) {
      listeners[key].add(action);
      return () => listeners[key].delete(action);
    },
    respond(key: ShortcutKey) {
      const action = [...listeners[key]].at(-1);
      if (!action) return false;
      action();
      return true;
    },
  };
}

const Commands = createContext<ReturnType<typeof createShortcutCommands> | null>(null);
const Receiver = requireNativeComponent<ReceiverProps>('SplotchShortcutKeyboard');
const styles = StyleSheet.create({ fill: { flex: 1 } });

type ScopeProps = ViewProps & {
  enabled: boolean;
  children: ReactNode;
  onEscape?: () => void;
};

function KeyboardScope({
  shortcutScope,
  enabled,
  onEscape,
  children,
  style,
  ...props
}: ScopeProps & { shortcutScope: ShortcutScope }) {
  const [commands] = useState(createShortcutCommands);
  const current = useRef({ enabled, onEscape });
  current.current = { enabled, onEscape };
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <Commands.Provider value={commands}>
      <Receiver
        {...props}
        style={[styles.fill, style]}
        importantForAccessibility="no"
        shortcutScope={shortcutScope}
        shortcutsEnabled={enabled}
        onShortcutKey={({ nativeEvent }) => {
          if (!mounted.current || !current.current.enabled) return;
          const key = nativeEvent.key;
          if (key !== 'undo' && key !== 'escape')
            throw new Error('Unrecognized drawing shortcut key.');
          if (!commands.respond(key) && key === 'escape') current.current.onEscape?.();
        }}
      >
        {children}
      </Receiver>
    </Commands.Provider>
  );
}

export function DrawingKeyboardScope(props: Omit<ScopeProps, 'onEscape'>) {
  return <KeyboardScope {...props} shortcutScope="drawing" testID="drawing-keyboard-scope" />;
}

export function ModalKeyboardScope(props: ScopeProps & { onEscape: () => void }) {
  return <KeyboardScope {...props} shortcutScope="modal" testID="modal-keyboard-scope" />;
}

export function useKeyboardCommand(key: ShortcutKey, enabled: boolean, action: () => void) {
  const commands = useContext(Commands);
  const current = useRef(action);
  current.current = action;
  useLayoutEffect(() => {
    if (!enabled || !commands) return;
    const unregister = commands.register(key, () => current.current());
    return () => {
      unregister();
    };
  }, [commands, key, enabled]);
}
