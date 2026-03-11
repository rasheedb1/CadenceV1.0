import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, createSupabaseClient } from '../_shared/supabase.ts'

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const user = await getAuthUser(authHeader)
    if (!user) return errorResponse('Unauthorized', 401)

    const { cadenceId } = await req.json()
    if (!cadenceId) return errorResponse('Missing cadenceId', 400)

    // Service role client — bypasses RLS, ownership validated explicitly below
    const supabase = createSupabaseClient()

    // Verify cadence belongs to this user before deleting
    const { data: cadence, error: fetchErr } = await supabase
      .from('cadences')
      .select('id, owner_id, org_id')
      .eq('id', cadenceId)
      .is('deleted_at', null)
      .single()

    if (fetchErr || !cadence) {
      return errorResponse('Cadencia no encontrada', 404)
    }

    if (cadence.owner_id !== user.id) {
      return errorResponse('No tienes permiso para eliminar esta cadencia', 403)
    }

    // Soft-delete: set deleted_at
    const { error: deleteErr } = await supabase
      .from('cadences')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', cadenceId)
      .eq('owner_id', user.id)

    if (deleteErr) throw deleteErr

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('delete-cadence error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
