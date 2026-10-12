# Native candidate Reduce Motion

The device preference controls the existing React Native fades in the saved-pictures modal, Coloring
Pages picker, and color picker. The production `useModalAnimation` hook consumes one
`observeReduceMotion` owner per mounted caller. Its initial state is reduced motion. It subscribes
before querying the pinned React Native `AccessibilityInfo` API, preserves newer device events over
late reads, and removes the listener and suppresses late publications on disposal. A failed query or
listener installation keeps animations disabled without blocking drawing or saving.

The RSD `NativeDialog` keeps its existing `animationType="none"` behavior. This unit adds no app
setting, storage, dependency, native bridge, or template recipe extension. The original finite
native source inventory and authenticated template baseline remain unchanged.

Scoped tests mount the real drawing screen and its three modal callers against the actual
AccessibilityInfo adapter contract. They cover enabled and disabled initial preferences, deferred
reads, failed reads, live changes, modal identity, close actions, drawing and Save availability,
color-picker focus return, and unmount cleanup. Owner tests cover both directions of the
delayed-read race and late rejection. Negative controls remove conservative initialization, event
ordering, disposal guards, the three new modal bindings, and the unchanged RSD no-animation
contract; each must fail assertions before restoring the exact source bytes.

This is source and controlled mounted-component evidence. Android and iOS device preference changes,
physical focus behavior, and animation pixels still require native qualification. The unit has no
independent external review yet and does not select a framework or accept the complete migration.
