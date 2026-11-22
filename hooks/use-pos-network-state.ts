"use client"

import { useCallback, useEffect, useState } from "react"
import { listOfflineMutations, offlineCheckoutBody, syncOfflineMutations, type OfflineMutation } from "@/lib/offline/queue"
import { showError, showInfo, showSuccess, showWarning } from "@/lib/toast-handler"

export function usePosNetworkState(organizationId?: string, branchId?: string) {
  const [mutations, setMutations] = useState<OfflineMutation[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [syncingOffline, setSyncingOffline] = useState(false)

  const refreshOfflineCount = useCallback(async () => {
    try {
      setMutations(await listOfflineMutations())
    } catch {
      // IndexedDB may be unavailable in privacy modes; network POS still works.
    }
  }, [])

  const syncNow = useCallback(async () => {
    setSyncingOffline(true)
    try {
      const result = await syncOfflineMutations()
      if (result.synced > 0) showSuccess(`${result.synced} transaksi offline berhasil disinkronkan ke server!`)
      if (result.failed > 0) showWarning(`${result.failed} transaksi offline perlu diperiksa.`)
      else if (result.pending > 0) showWarning(`Ada ${result.pending} antrean offline yang belum tersinkronisasi.`)
      await refreshOfflineCount()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menyinkronkan data offline")
    } finally {
      setSyncingOffline(false)
    }
  }, [refreshOfflineCount])

  useEffect(() => {
    if (typeof navigator !== "undefined") setIsOnline(navigator.onLine)
    void refreshOfflineCount()

    const handleOnline = async () => {
      setIsOnline(true)
      showInfo("Koneksi internet kembali aktif. Menyinkronkan data offline...")
      await syncNow()
    }
    const handleOffline = () => {
      setIsOnline(false)
      showWarning("Koneksi terputus. POS beroperasi dalam Mode Offline.")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    const interval = window.setInterval(refreshOfflineCount, 6_000)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      window.clearInterval(interval)
    }
  }, [refreshOfflineCount, syncNow])

  const offlineSales = mutations.filter((mutation) => {
    const body = offlineCheckoutBody(mutation)
    return mutation.organizationId === organizationId && body?.branchId === branchId && Boolean(body)
  })

  return { offlineSales, isOnline, syncingOffline, refreshOfflineCount, syncNow }
}
