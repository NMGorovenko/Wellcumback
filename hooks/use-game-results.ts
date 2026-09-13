'use client';
import { useSyncExternalStore } from 'react';
import type { Result } from '@/lib/game/types';
import { appendResult } from '@/lib/game/results';

const STORAGE_KEY = 'wellcum-results-v1';
const EMPTY: Result[] = [];
let current: Result[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Result[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter((value: unknown): value is Result => {
        if (!value || typeof value !== 'object') return false;
        const r = value as Partial<Result>;
        return (
          (r.story === 'screen' ||
            r.story === 'clean' ||
            r.story === 'moving') &&
          typeof r.score === 'number' &&
          Number.isFinite(r.score) &&
          r.score >= 0 &&
          typeof r.seconds === 'number' &&
          Number.isFinite(r.seconds) &&
          typeof r.players === 'number' &&
          [1, 2, 3].includes(r.players) &&
          typeof r.date === 'string' &&
          (r.runId === undefined ||
            (typeof r.runId === 'string' && r.runId.length <= 200)) &&
          typeof r.details === 'string'
        );
      })
      .slice(-30);
  } catch {
    return [];
  }
}
function snapshot() {
  if (!loaded) {
    loaded = true;
    current = read();
  }
  return current;
}
function serverSnapshot() {
  return EMPTY;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    current = read();
    listeners.forEach((notify) => notify());
  };
  window.addEventListener('storage', storage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storage);
  };
}
function addResult(result: Result) {
  const updated = appendResult(snapshot(), result);
  if (updated === current) return;
  current = updated;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* This evening still works in memory if storage is unavailable. */
  }
  listeners.forEach((notify) => notify());
}
export function useGameResults() {
  return [
    useSyncExternalStore(subscribe, snapshot, serverSnapshot),
    addResult,
  ] as const;
}
