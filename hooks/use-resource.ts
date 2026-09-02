"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch, ACTIVE_ORGANIZATION_KEY } from "@/lib/client"

export type ResourceRecord = { id: string }

export function useResource<T extends ResourceRecord = ResourceRecord>(resource: string, query = "") {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const doRefresh = useCallback(async () => {
    if (typeof window !== "undefined" && !localStorage.getItem(ACTIVE_ORGANIZATION_KEY)) {
      setLoading(false)
      setData([])
      return
    }
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams(query)
      const hasExplicitPage = params.has("page")
      let page = Number(params.get("page") || "1")
      const rows: T[] = []
      do {
        params.set("page", String(page))
        const response = await apiFetch<T[]>(`/api/v1/resources/${resource}?${params.toString()}`)
        const batch = Array.isArray(response?.data) ? response.data : []
        rows.push(...batch)
        if (hasExplicitPage || response.meta?.hasMore !== true || batch.length === 0) break
        page += 1
      } while (true)
      setData(rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal mengambil data")
    }
    finally { setLoading(false) }
  }, [resource, query])

  const refresh = useCallback(async (debounceMs = 300) => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    if (debounceMs <= 0) {
      await doRefresh()
      return
    }
    refreshTimeoutRef.current = setTimeout(() => void doRefresh(), debounceMs)
  }, [doRefresh])

  useEffect(() => {
    void doRefresh()
    const handleContextChange = () => void doRefresh()
    window.addEventListener("kedai-ku-context-change", handleContextChange)
    return () => window.removeEventListener("kedai-ku-context-change", handleContextChange)
  }, [doRefresh])

  async function create(input: Record<string, unknown>, options: { queueOffline?: boolean } = {}) {
    const response = await apiFetch<T>(`/api/v1/resources/${resource}`, { method: "POST", body: JSON.stringify(input), queueOffline: options.queueOffline ?? true })
    if (!response.queued) await refresh(0)
    return response
  }

  async function update(id: string, input: Record<string, unknown>, options: { queueOffline?: boolean } = {}) {
    const response = await apiFetch<T>(`/api/v1/resources/${resource}/${id}`, { method: "PATCH", body: JSON.stringify(input), queueOffline: options.queueOffline ?? true })
    if (!response.queued) await refresh(0)
    return response
  }

  async function remove(id: string, options: { queueOffline?: boolean } = {}) {
    const response = await apiFetch<null>(`/api/v1/resources/${resource}/${id}`, { method: "DELETE", queueOffline: options.queueOffline ?? true })
    if (!response.queued) await refresh(0)
    return response
  }

  return { data, loading, error, refresh, create, update, remove }
}
