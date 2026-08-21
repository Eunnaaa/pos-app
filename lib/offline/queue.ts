"use client"

const DB_NAME = "kedai-ku-offline"
const STORE_NAME = "mutations"
const DB_VERSION = 1

export type OfflineMutation = {
  id: string
  url: string
  method: "POST" | "PATCH" | "DELETE"
  organizationId: string
  branchId?: string
  idempotencyKey: string
  body: unknown
  createdAt: string
  attempts: number
  lastError?: string
  /** Server rejected this for good. Kept for review, skipped by sync so it cannot block the queue. */
  failedPermanently?: boolean
}

export const MAX_SYNC_ATTEMPTS = 5

/** 400/403/404/422 will never succeed on replay. Everything else may (session expiry, rate limit,
 *  server error, and the ambiguous 409 that means either "already exists" or "still processing"),
 *  so retry those until the attempt cap turns them into a dead letter. */
const PERMANENT_STATUSES = new Set([400, 403, 404, 422])

export function classifySyncResponse(status: number, attempts: number): "synced" | "failed" | "retry" {
  if (status >= 200 && status < 300) return "synced"
  if (PERMANENT_STATUSES.has(status)) return "failed"
  return attempts + 1 >= MAX_SYNC_ATTEMPTS ? "failed" : "retry"
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("createdAt", "createdAt")
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, execute: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode)
    execute(tx.objectStore(STORE_NAME), resolve, reject)
    tx.oncomplete = () => database.close()
    tx.onerror = () => reject(tx.error)
  })
}

export async function enqueueOfflineMutation(input: Omit<OfflineMutation, "id" | "createdAt" | "attempts">): Promise<OfflineMutation> {
  const mutation: OfflineMutation = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0 }
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.add(mutation)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  return mutation
}

export async function listOfflineMutations(): Promise<OfflineMutation[]> {
  return transaction<OfflineMutation[]>("readonly", (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve((request.result as OfflineMutation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    request.onerror = () => reject(request.error)
  })
}

async function removeMutation(id: string): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function updateMutation(mutation: OfflineMutation): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(mutation)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export type SyncResult = { synced: number; pending: number; failed: number }

export async function syncOfflineMutations(): Promise<SyncResult> {
  const all = await listOfflineMutations()
  const queued = all.filter((mutation) => !mutation.failedPermanently)
  const deadLettered = all.length - queued.length
  if (typeof navigator === "undefined" || !navigator.onLine) return { synced: 0, pending: queued.length, failed: deadLettered }
  let synced = 0
  let failed = 0

  for (const mutation of queued) {
    let verdict: ReturnType<typeof classifySyncResponse>
    let reason = ""
    try {
      const response = await fetch(mutation.url, {
        method: mutation.method,
        headers: {
          "content-type": "application/json",
          "x-organization-id": mutation.organizationId,
          ...(mutation.branchId ? { "x-branch-id": mutation.branchId } : {}),
          "idempotency-key": mutation.idempotencyKey,
        },
        body: mutation.method === "DELETE" ? undefined : JSON.stringify(mutation.body),
        credentials: "include",
      })
      verdict = classifySyncResponse(response.status, mutation.attempts)
      if (verdict !== "synced") reason = `Sync failed with status ${response.status}`
    } catch (error) {
      // Status 0: no response at all, so treat as transient until the attempt cap.
      verdict = classifySyncResponse(0, mutation.attempts)
      reason = error instanceof Error ? error.message : "Unknown sync error"
    }

    if (verdict === "synced") {
      await removeMutation(mutation.id)
      synced += 1
      continue
    }

    await updateMutation({ ...mutation, attempts: mutation.attempts + 1, lastError: reason, failedPermanently: verdict === "failed" })
    // Dead letter: keep going so one rejected mutation cannot strand every later one.
    if (verdict === "failed") { failed += 1; continue }
    // Transient: stop here to preserve queue order; the next online event retries.
    break
  }

  return { synced, pending: queued.length - synced - failed, failed: deadLettered + failed }
}
