"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

export function getRealtimeClient(): SupabaseClient | null {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  client = createClient(url, anon, { realtime: { params: { eventsPerSecond: 10 } } })
  return client
}

export type RealtimeTable = "sales_orders" | "stock_balances" | "cash_register_sessions"

export function subscribeToTable(
  table: RealtimeTable,
  organizationId: string,
  onEvent: () => void,
): () => void {
  const supabase = getRealtimeClient()
  if (!supabase) return () => undefined
  const channel = supabase
    .channel(`kasir-ku-${table}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
      () => onEvent(),
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}