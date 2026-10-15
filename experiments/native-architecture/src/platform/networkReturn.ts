import { addNetworkStateListener } from 'expo-network';

export function subscribeNetworkReturn(listener: () => void): () => void {
  let active = true;
  const subscription = addNetworkStateListener(({ isConnected }) => {
    if (active && isConnected === true) listener();
  });
  return () => {
    active = false;
    subscription.remove();
  };
}
