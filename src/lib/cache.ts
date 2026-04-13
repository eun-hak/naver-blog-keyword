import { CACHE_TTL_MS, MAX_CACHE_SIZE } from '@/constants';

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number = CACHE_TTL_MS): void {
    if (this.store.size >= MAX_CACHE_SIZE) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.store.clear();
  }
}

export const analysisCache = new MemoryCache();
