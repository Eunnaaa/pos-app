"use client"

import { useEffect } from "react"
import { mountToaster } from "gooey-toast"

export function GooeyToaster() {
  useEffect(() => {
    const toaster = mountToaster({ position: "top-center" })
    return () => toaster.unmount()
  }, [])
  return null
}
