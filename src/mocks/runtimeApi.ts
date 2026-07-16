/** Persistence for mock appointments + pending presence. */

const RUNTIME_BASE = "/__runtime";

export const RUNTIME_APPOINTMENTS_FILE = "appointments.json";
export const RUNTIME_PENDING_FILE = "pending.json";
export const RUNTIME_SYNC_CHANNEL = "keyloop.scheduler.runtime-sync";

export type LocalSaveMode = "json" | "localstorage";

/**
 * `VITE_LOCAL_SAVE_MODE=json` → `.runtime-data/*.json` via Vite `/__runtime` (dev only)
 * `VITE_LOCAL_SAVE_MODE=localstorage` → browser localStorage (works in preview / static host)
 */
export function getLocalSaveMode(): LocalSaveMode {
  const raw = String(import.meta.env.VITE_LOCAL_SAVE_MODE ?? "localstorage")
    .toLowerCase()
    .trim();
  return raw === "localstorage" ? "localstorage" : "json";
}

export function localStorageKeyFor(fileName: string): string {
  return `keyloop.scheduler.runtime.${fileName}`;
}

function readFromLocalStorage<T>(fileName: string): T | null {
  try {
    const raw = localStorage.getItem(localStorageKeyFor(fileName));
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeToLocalStorage(fileName: string, data: unknown): void {
  localStorage.setItem(localStorageKeyFor(fileName), JSON.stringify(data, null, 2));
}

async function readFromJsonFile<T>(fileName: string): Promise<T | null> {
  try {
    const response = await fetch(`${RUNTIME_BASE}/${fileName}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data as T | null;
  } catch {
    return null;
  }
}

async function writeToJsonFile(fileName: string, data: unknown): Promise<void> {
  const response = await fetch(`${RUNTIME_BASE}/${fileName}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data, null, 2),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to write ${fileName}: HTTP ${response.status}`);
  }
}

export async function readRuntimeJson<T>(fileName: string): Promise<T | null> {
  if (getLocalSaveMode() === "localstorage") {
    return readFromLocalStorage<T>(fileName);
  }
  return readFromJsonFile<T>(fileName);
}

export async function writeRuntimeJson(fileName: string, data: unknown): Promise<void> {
  if (getLocalSaveMode() === "localstorage") {
    writeToLocalStorage(fileName, data);
    return;
  }
  await writeToJsonFile(fileName, data);
}

/** Atomic upsert/remove for pending.json (server merges by sessionId). */
export type PendingUpsert = { sessionId: string } & Record<string, unknown>;

function normalizePendingList(parsed: unknown): PendingUpsert[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is PendingUpsert =>
        !!item && typeof item === "object" && typeof (item as PendingUpsert).sessionId === "string",
    );
  }
  if (parsed && typeof parsed === "object") {
    return Object.values(parsed as Record<string, PendingUpsert>).filter(item => typeof item?.sessionId === "string");
  }
  return [];
}

function applyPendingPatch(list: PendingUpsert[], op: { upsert?: PendingUpsert; remove?: string }): PendingUpsert[] {
  let next = [...list];
  if (op.remove) {
    next = next.filter(item => item.sessionId !== op.remove);
  }
  if (op.upsert) {
    const index = next.findIndex(item => item.sessionId === op.upsert!.sessionId);
    if (index === -1) next.push(op.upsert);
    else next[index] = op.upsert;
  }
  return next;
}

/** Atomic upsert/remove for pending store (json file or localStorage). */
export async function patchPendingJson(op: { upsert?: PendingUpsert; remove?: string }): Promise<unknown[]> {
  if (getLocalSaveMode() === "localstorage") {
    const current = normalizePendingList(readFromLocalStorage(RUNTIME_PENDING_FILE));
    const next = applyPendingPatch(current, op);
    writeToLocalStorage(RUNTIME_PENDING_FILE, next);
    return next;
  }

  const response = await fetch(`${RUNTIME_BASE}/${RUNTIME_PENDING_FILE}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(op),
  });
  if (!response.ok) {
    throw new Error(`Failed to patch ${RUNTIME_PENDING_FILE}: HTTP ${response.status}`);
  }
  return (await response.json()) as unknown[];
}

export function notifyRuntimeSync(kind: "appointments" | "pending") {
  try {
    const channel = new BroadcastChannel(RUNTIME_SYNC_CHANNEL);
    channel.postMessage({
      type: `${kind}.changed`,
      at: new Date().toISOString(),
      mode: getLocalSaveMode(),
    });
    channel.close();
  } catch {
    // ignore
  }
}
