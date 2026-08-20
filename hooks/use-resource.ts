"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch } from "@/lib/client"

export type ResourceRecord = { id: string }

export function useResource<T extends ResourceRecord = ResourceRecord>(resource: string, query = "") {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const doRefresh = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const suffix = query ? `?${query}` : ""
      const response = await apiFetch<T[]>(`/api/v1/resources/${resource}${suffix}`)
      setData(response.data)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Gagal mengambil data") }
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
    window.addEventListener("kasir-ku-context-change", handleContextChange)
    return () => window.removeEventListener("kasir-ku-context-change", handleContextChange)
  }, [doRefresh])

  async function create(input: Record<string, unknown>) {
    const response = await apiFetch<T>(`/api/v1/resources/${resource}`, { method: "POST", body: JSON.stringify(input), queueOffline: true })
    if (!response.queued) await refresh(0)
    return response
  }

  async function update(id: string, input: Record<string, unknown>) {
    const response = await apiFetch<T>(`/api/v1/resources/${resource}/${id}`, { method: "PATCH", body: JSON.stringify(input), queueOffline: true })
    if (!response.queued) await refresh(0)
    return response
  }

  async function remove(id: string) {
    const response = await apiFetch<null>(`/api/v1/resources/${resource}/${id}`, { method: "DELETE", queueOffline: true })
    if (!response.queued) await refresh(0)
    return response
  }

  return { data, loading, error, refresh, create, update, remove }
}
