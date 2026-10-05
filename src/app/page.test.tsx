import { describe, expect, it, vi } from 'vitest';
import HomePage from './page';

const redirect = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
);

vi.mock('next/navigation', () => ({ redirect }));

describe('HomePage', () => {
  it('encaminha a entrada do site para a vitrine pública, sem exigir login', () => {
    expect(() => HomePage()).toThrow('NEXT_REDIRECT /explorar');
    expect(redirect).toHaveBeenCalledWith('/explorar');
  });
});
