/**
 * Knowledge Consolidation — Memory maintenance job
 *
 * Triggered by pg_cron every 6 hours. Maintains agent_knowledge:
 * 1. Expire entries past valid_until
 * 2. Decay importance of old, unused entries
 * 3. Merge near-duplicate entries (same content, different agents)
 * 4. Cap per-agent knowledge to prevent bloat
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const MAX_KNOWLEDGE_PER_AGENT = 100   // Hard cap
const DECAY_FACTOR = 0.95             // Multiply importance by this for entries not accessed in 7 days
const SIMILARITY_THRESHOLD = 0.85     // Content overlap for merge (simple word overlap)
const STALE_DAYS = 30                 // Entries older than this with 0 access get expired

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) { if (wordsB.has(w)) overlap++ }
  return overlap / Math.max(wordsA.size, wordsB.size)
}

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()
  const stats = { expired: 0, decayed: 0, merged: 0, capped: 0 }

  try {
    const now = new Date()

    // 1. Expire entries past valid_until (delete them)
    const { data: expiredRows } = await supabase
      .from('agent_knowledge')
      .delete()
      .lt('valid_until', now.toISOString())
      .not('valid_until', 'is', null)
      .select('id')
    stats.expired = expiredRows?.length || 0

    // 2. Decay importance of stale entries (not accessed in 7+ days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
    const { data: staleEntries } = await supabase
      .from('agent_knowledge')
      .select('id, importance')
      .or(`last_accessed_at.is.null,last_accessed_at.lt.${sevenDaysAgo}`)
      .is('valid_until', null)
      .gt('importance', 0.1)  // Don't decay below 0.1
      .limit(200)

    if (staleEntries && staleEntries.length > 0) {
      for (const entry of staleEntries) {
        const newImportance = Math.max(0.1, (entry.importance || 0.5) * DECAY_FACTOR)
        await supabase
          .from('agent_knowledge')
          .update({ importance: parseFloat(newImportance.toFixed(3)), updated_at: now.toISOString() })
          .eq('id', entry.id)
        stats.decayed++
      }
    }

    // 3. Expire very old entries with zero access
    const staleDaysAgo = new Date(now.getTime() - STALE_DAYS * 86400000).toISOString()
    const { data: oldExpiredRows } = await supabase
      .from('agent_knowledge')
      .update({ valid_until: now.toISOString() })
      .lt('created_at', staleDaysAgo)
      .eq('access_count', 0)
      .lt('importance', 0.3)
      .is('valid_until', null)
      .select('id')
    stats.expired += (oldExpiredRows?.length || 0)

    // 4. Merge near-duplicate entries (per org)
    const { data: orgs } = await supabase
      .from('agent_knowledge')
      .select('org_id')
      .is('valid_until', null)
      .limit(1000)

    const uniqueOrgs = [...new Set((orgs || []).map(o => o.org_id))]

    for (const orgId of uniqueOrgs) {
      const { data: entries } = await supabase
        .from('agent_knowledge')
        .select('id, content, importance, access_count, agent_id, category')
        .eq('org_id', orgId)
        .is('valid_until', null)
        .order('importance', { ascending: false })
        .limit(200)

      if (!entries || entries.length < 2) continue

      const merged = new Set<string>()
      for (let i = 0; i < entries.length; i++) {
        if (merged.has(entries[i].id)) continue
        for (let j = i + 1; j < entries.length; j++) {
          if (merged.has(entries[j].id)) continue
          // Same category + high word overlap = duplicate
          if (entries[i].category === entries[j].category &&
              wordOverlap(entries[i].content, entries[j].content) >= SIMILARITY_THRESHOLD) {
            // Keep the higher importance one, expire the other
            const keeper = entries[i].importance >= entries[j].importance ? entries[i] : entries[j]
            const loser = keeper === entries[i] ? entries[j] : entries[i]

            // Boost keeper with loser's access count
            await supabase
              .from('agent_knowledge')
              .update({
                access_count: (keeper.access_count || 0) + (loser.access_count || 0),
                importance: Math.min(1.0, (keeper.importance || 0.5) + 0.05),
                updated_at: now.toISOString(),
              })
              .eq('id', keeper.id)

            // Expire the loser
            await supabase
              .from('agent_knowledge')
              .update({ valid_until: now.toISOString() })
              .eq('id', loser.id)

            merged.add(loser.id)
            stats.merged++
          }
        }
      }
    }

    // 5. Cap knowledge per agent (keep top N by importance)
    {
      const { data: allKnowledge } = await supabase
        .from('agent_knowledge')
        .select('agent_id')
        .is('valid_until', null)

      if (allKnowledge) {
        const counts: Record<string, number> = {}
        for (const k of allKnowledge) {
          const key = k.agent_id || '__team__'
          counts[key] = (counts[key] || 0) + 1
        }
        for (const [agentId, count] of Object.entries(counts)) {
          if (count > MAX_KNOWLEDGE_PER_AGENT) {
            const excess = count - MAX_KNOWLEDGE_PER_AGENT
            const query = supabase
              .from('agent_knowledge')
              .select('id')
              .is('valid_until', null)
              .order('importance', { ascending: true })
              .order('created_at', { ascending: true })
              .limit(excess)

            if (agentId === '__team__') {
              query.is('agent_id', null)
            } else {
              query.eq('agent_id', agentId)
            }

            const { data: toExpire } = await query
            if (toExpire) {
              for (const entry of toExpire) {
                await supabase
                  .from('agent_knowledge')
                  .update({ valid_until: now.toISOString() })
                  .eq('id', entry.id)
                stats.capped++
              }
            }
          }
        }
      }
    }

    console.log(`[consolidation] Done: expired=${stats.expired}, decayed=${stats.decayed}, merged=${stats.merged}, capped=${stats.capped}`)
    return jsonResponse({ success: true, stats })

  } catch (err) {
    console.error('[consolidation] Error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
