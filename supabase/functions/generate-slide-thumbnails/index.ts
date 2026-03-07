import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'

/**
 * generate-slide-thumbnails
 *
 * Converts a PPTX template into per-slide PNG images using ConvertAPI,
 * stores each image in Supabase Storage, and updates the template record
 * with the thumbnail_paths array.
 *
 * POST body: { template_id: string }
 * Response:  { thumbnail_paths: string[] }
 *
 * Requires CONVERT_API_SECRET env var (from convertapi.com).
 */

serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const { template_id } = await req.json()
    if (!template_id) return errorResponse('template_id required')

    const supabase = createSupabaseClient(authHeader)
    const convertApiSecret = Deno.env.get('CONVERT_API_SECRET')
    if (!convertApiSecret) return errorResponse('CONVERT_API_SECRET not configured', 500)

    // ── 1. Get template record ─────────────────────────────────────────────────
    const { data: template, error: tErr } = await supabase
      .from('business_case_templates')
      .select('id, org_id, pptx_storage_path')
      .eq('id', template_id)
      .eq('org_id', ctx.orgId)
      .single()

    if (tErr || !template) return errorResponse('Template not found', 404)
    if (!template.pptx_storage_path) return errorResponse('No PPTX uploaded for this template', 400)

    // ── 2. Download PPTX from Supabase Storage ─────────────────────────────────
    const { data: pptxBlob, error: dlErr } = await supabase.storage
      .from('bc-templates')
      .download(template.pptx_storage_path)

    if (dlErr || !pptxBlob) return errorResponse(`Failed to download PPTX: ${dlErr?.message}`, 500)

    // ── 3. Call ConvertAPI: PPTX → PNG (one image per slide) ──────────────────
    const pptxBytes = new Uint8Array(await pptxBlob.arrayBuffer())

    const formData = new FormData()
    formData.append('File', new Blob([pptxBytes], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }), 'template.pptx')

    const convertRes = await fetch(
      `https://v2.convertapi.com/convert/pptx/to/png?Secret=${convertApiSecret}&StoreFile=false`,
      {
        method: 'POST',
        body: formData,
      }
    )

    if (!convertRes.ok) {
      const errText = await convertRes.text()
      console.error('ConvertAPI error:', errText)
      return errorResponse(`ConvertAPI failed: ${convertRes.status}`, 500)
    }

    const convertData = await convertRes.json()
    const files: Array<{ FileData: string; FileName: string }> = convertData.Files ?? []

    console.log(`ConvertAPI returned ${files.length} files`)
    if (files.length === 0) return errorResponse('ConvertAPI returned no slides', 500)

    // ── 4. Upload each PNG to Supabase Storage ─────────────────────────────────
    // Path: bc-templates/thumbnails/{org_id}/{template_id}/slide_{n}.png
    const thumbnailPaths: string[] = []
    const uploadErrors: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        // ConvertAPI returns base64-encoded file data
        const base64 = file.FileData
        if (!base64) {
          uploadErrors.push(`Slide ${i + 1}: no FileData`)
          continue
        }

        // Decode base64 to binary
        const binaryStr = atob(base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let j = 0; j < binaryStr.length; j++) {
          bytes[j] = binaryStr.charCodeAt(j)
        }

        const storagePath = `thumbnails/${ctx.orgId}/${template_id}/slide_${i + 1}.png`

        // Use Blob for better compatibility with Deno Supabase client
        const blob = new Blob([bytes], { type: 'image/png' })

        const { error: upErr } = await supabase.storage
          .from('bc-templates')
          .upload(storagePath, blob, {
            contentType: 'image/png',
            upsert: true,
          })

        if (upErr) {
          const errMsg = `Slide ${i + 1}: ${upErr.message || JSON.stringify(upErr)}`
          console.error(`Upload failed -`, errMsg)
          uploadErrors.push(errMsg)
          continue
        }

        thumbnailPaths.push(storagePath)
        console.log(`  Uploaded slide ${i + 1} (${bytes.length} bytes)`)
      } catch (slideErr) {
        const errMsg = `Slide ${i + 1}: ${slideErr instanceof Error ? slideErr.message : String(slideErr)}`
        console.error(`Processing failed -`, errMsg)
        uploadErrors.push(errMsg)
      }
    }

    if (thumbnailPaths.length === 0) {
      return errorResponse(`Failed to store any slide thumbnails. Errors: ${uploadErrors.slice(0, 5).join('; ')}`, 500)
    }

    // ── 5. Update template record with thumbnail_paths ─────────────────────────
    const { error: updErr } = await supabase
      .from('business_case_templates')
      .update({ thumbnail_paths: thumbnailPaths, updated_at: new Date().toISOString() })
      .eq('id', template_id)

    if (updErr) return errorResponse(`Failed to update template: ${updErr.message}`, 500)

    console.log(`Generated ${thumbnailPaths.length} thumbnails for template ${template_id}`)
    return jsonResponse({ thumbnail_paths: thumbnailPaths })

  } catch (err) {
    console.error('generate-slide-thumbnails error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500)
  }
})
