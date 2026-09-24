"use client"

import { useCallback, useEffect, useState } from "react"
import { listOfflineMutations, syncOfflineMutations } from "@/lib/offline/queue"
import { showError, showInfo, showSuccess, showWarning } from "@/lib/toast-handler"

export function usePosNetworkState() {
  const [offlineCount, setOfflineCount] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [syncingOffline, setSyncingOffline] = useState(false)

  const refreshOfflineCount = useCallback(async () => {
    try {
      const mutations = await listOfflineMutations()
      setOfflineCount(mutations.filter((mutation) => !mutation.failedPermanently).length)
    } catch {
      // IndexedDB may be unavailable in privacy modes; network POS still works.
    }
  }, [])

  useEffect(() => {
    if (typeof navigator !== "undefined") setIsOnline(navigator.onLine)
    void refreshOfflineCount()

    const handleOnline = async () => {
      setIsOnline(true)
      showInfo("Koneksi internet kembali aktif. Menyinkronkan data offline...")
      const result = await syncOfflineMutations()
      if (result.synced > 0) showSuccess(`${result.synced} transaksi offline berhasil disinkronkan ke server!`)
      await refreshOfflineCount()
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
  }, [refreshOfflineCount])

  async function syncNow() {
    setSyncingOffline(true)
    try {
      const result = await syncOfflineMutations()
      if (result.synced > 0) showSuccess(`${result.synced} transaksi offline berhasil disinkronkan ke server!`)
      else if (result.pending > 0) showWarning(`Ada ${result.pending} antrean offline yang menunggu koneksi stabil.`)
      else showInfo("Semua data transaksi sudah tersinkronisasi.")
      await refreshOfflineCount()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menyinkronkan data offline")
    } finally {
      setSyncingOffline(false)
    }
  }

  return { offlineCount, isOnline, syncingOffline, refreshOfflineCount, syncNow }
}
