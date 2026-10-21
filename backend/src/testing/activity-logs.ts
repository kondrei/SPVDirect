import { vi } from 'vitest';

export function fakeActivityLogs() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    recordMany: vi.fn().mockResolvedValue(undefined),
    all: vi.fn().mockResolvedValue([]),
  };
}
