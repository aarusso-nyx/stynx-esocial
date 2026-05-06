export function assertNever(value, message = 'Unhandled discriminated union member') {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}
