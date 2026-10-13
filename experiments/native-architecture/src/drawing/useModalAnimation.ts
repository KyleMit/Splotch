import { useReduceMotion } from './useReduceMotion';

export function useModalAnimation(): 'none' | 'fade' {
  return useReduceMotion() ? 'none' : 'fade';
}
