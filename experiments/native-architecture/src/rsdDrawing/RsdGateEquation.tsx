import type { ComponentProps, ComponentPropsWithRef } from 'react';
import { View } from 'react-native';
import { compat, type html } from 'react-strict-dom';

export function RsdGateEquation({ children, ...props }: ComponentProps<typeof html.div>) {
  return (
    <compat.native<ComponentPropsWithRef<typeof View>> {...props} as="div">
      {(resolved) => (
        <View {...resolved} accessible>
          {children}
        </View>
      )}
    </compat.native>
  );
}
