import { useCallback, useEffect, useState } from 'react';
import { callApi } from '@/lib/api';

/**
 * A shop's storage: its pictures and its sales data, and its package limit
 * (Starter 500 MB, Business 2 GB, Enterprise 10 GB). Counted by JPOS's server
 * (api/usage.ts); only admins and the Super Admin can ask.
 */
export interface StorageUsage {
  usedBytes: number;
  /** null = no limit */
  limitBytes: number | null;
  photosBytes: number;
  dataBytes: number;
  pictures: number;
  products: number;
  orders: number;
}

export function getStorageUsage(tenantId?: string): Promise<StorageUsage> {
  return callApi<StorageUsage>('usage', tenantId ? { tenantId } : {});
}

/** "512 KB", "12.4 MB", "2 GB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? Number(gb.toFixed(1)) : Math.round(gb)} GB`;
}

/** 0–100, how full the storage is (0 when there's no limit). */
export const usedPercent = (u: StorageUsage) => (u.limitBytes ? Math.min(100, Math.round((u.usedBytes / u.limitBytes) * 100)) : 0);

export const STORAGE_FULL = 'Your storage is full. Remove some photos, or move to a bigger package.';

/**
 * The signed-in admin's shop storage, for pages that upload pictures. When
 * it's full, new pictures wait (selling never stops). If it can't be read,
 * uploading is allowed rather than blocked.
 */
export function useStorage(enabled = true) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    try { setUsage(await getStorageUsage()); setFailed(false); } catch { setFailed(true); }
  }, []);
  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);
  const full = !!usage && usage.limitBytes != null && usage.usedBytes >= usage.limitBytes;
  return { usage, failed, full, refresh };
}
