// The `default` of an exhaustive switch: a new union member that no branch
// handles fails to compile here (the value is no longer `never`), and a value
// that reaches it at runtime anyway names itself in the error.
export function unreachable(value: never): never {
  throw new Error(`Unreachable case: ${JSON.stringify(value)}`);
}
