// The native-boundary assertions the RSD renderer suites share.
export function checkedRadio(node) {
  if (!node || node.getAttribute('role') !== 'radio' || node.dataset.checked !== 'true')
    throw new Error('Missing native checked radio');
}

export function checkedSwitch(node, checked) {
  if (!node || node.getAttribute('role') !== 'switch' || node.dataset.checked !== String(checked))
    throw new Error('Missing native checked switch');
}

export function visibleSelection(node) {
  const color = node?.querySelector('span')?.dataset.nativeColor;
  if (
    !node?.dataset.nativeBackground ||
    node.dataset.nativeBackground === 'transparent' ||
    !color ||
    node.dataset.nativeBackground === color
  )
    throw new Error('Missing contrasting native selected treatment');
}

export function assertDisabledBoundary(props, disabled) {
  if (props?.accessibilityState?.disabled !== disabled)
    throw new Error('Missing explicit native disabled boolean');
}
