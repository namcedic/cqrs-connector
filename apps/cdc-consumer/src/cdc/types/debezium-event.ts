export interface DebeziumEnvelope<T = unknown> {
  before: T | null;
  after: T | null;
  op: 'c' | 'u' | 'd' | 'r';
  ts_ms?: number;
}

export interface DebeziumWrappedEvent<T = unknown> {
  payload: DebeziumEnvelope<T>;
}

export type DebeziumMessage<T = unknown> =
  | DebeziumEnvelope<T>
  | DebeziumWrappedEvent<T>;

export interface DebeziumUser {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function isWrappedEvent<T = unknown>(
  value: unknown,
): value is DebeziumWrappedEvent<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'payload' in value &&
    typeof (value as DebeziumWrappedEvent<T>).payload === 'object' &&
    (value as DebeziumWrappedEvent<T>).payload !== null
  );
}

export function getEnvelope<T = unknown>(
  value: DebeziumMessage<T>,
): DebeziumEnvelope<T> | null {
  if (isWrappedEvent<T>(value)) {
    return value.payload;
  }

  const env = value;
  if (!('op' in env)) {
    return null;
  }

  return env;
}
