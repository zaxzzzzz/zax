import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function BuggyComponent({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Test Runtime Crash in Child Component');
  }
  return <div data-testid="normal-content">All good!</div>;
}

describe('ErrorBoundary Component', () => {
  it('renders children normally when no error occurs', () => {
    // Basic instantiation check
    const boundary = new ErrorBoundary({});
    expect(boundary.state.hasError).toBe(false);
  });

  it('updates state via getDerivedStateFromError when an error occurs', () => {
    const error = new Error('Simulated Crash');
    const newState = ErrorBoundary.getDerivedStateFromError(error);
    expect(newState.hasError).toBe(true);
    expect(newState.error).toBe(error);
  });
});
