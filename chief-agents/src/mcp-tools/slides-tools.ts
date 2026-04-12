/**
 * Google Slides tools — create presentations programmatically.
 * Requires 'presentations' capability. Uses same Google OAuth token.
 *
 * The agent describes slides in structured form, this tool creates
 * them in Google Slides and returns the presentation URL.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { getFreshGoogleToken } from '../utils/google-auth.js';

const SLIDES_BASE = 'https://slides.googleapis.com/v1/presentations';

async function slidesFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const url = path.startsWith('http') ? path : `${SLIDES_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Slides API ${res.status}: ${data?.error?.message || JSON.stringify(data).substring(0, 200)}`);
  return data;
}

// Predefined layouts
const LAYOUTS: Record<string, string> = {
  title: 'TITLE',
  title_body: 'TITLE_AND_BODY',
  title_two_columns: 'TITLE_AND_TWO_COLUMNS',
  section: 'SECTION_HEADER',
  blank: 'BLANK',
  one_column: 'ONE_COLUMN_TEXT',
  big_number: 'BIG_NUMBER',
  caption: 'CAPTION_ONLY',
};

export function buildSlidesTools(agent: AgentConfig): any[] {
  async function ensureToken(): Promise<{ token: string } | { error: string }> {
    const t = await getFreshGoogleToken(agent.orgId);
    if (!t) return { error: 'Google not connected. Ask user to reconnect Gmail (includes Slides scope).' };
    return { token: t.accessToken };
  }

  const createPresentation = tool(
    'create_presentation',
    `Create a Google Slides presentation with multiple slides. Each slide can have a title, body text (bullet points), and a layout. Returns the presentation URL that the user can open and edit.

Layouts available: title (title slide), title_body (title + text), title_two_columns (two columns), section (section header), blank (empty), one_column, big_number, caption.

Example usage:
- Title slide with company name
- Section headers to divide topics
- title_body slides for content with bullet points
- big_number for key metrics`,
    {
      title: z.string().describe('Presentation title'),
      slides: z.array(z.object({
        layout: z.string().optional().describe('Layout: title, title_body, section, blank, title_two_columns, big_number, caption. Default: title_body'),
        title: z.string().optional().describe('Slide title text'),
        body: z.string().optional().describe('Slide body text (supports line breaks for bullet points)'),
        speaker_notes: z.string().optional().describe('Speaker notes for this slide'),
      })).describe('Array of slides to create'),
    },
    async ({ title, slides }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // 1. Create blank presentation
        const pres = await slidesFetch('', t.token, {
          method: 'POST',
          body: JSON.stringify({ title }),
        });
        const presId = pres.presentationId;

        // 2. Get the default slide ID (first slide created automatically)
        const defaultSlideId = pres.slides?.[0]?.objectId;

        // 3. Build batch update requests
        const requests: any[] = [];

        // Delete the default blank slide if we're creating our own
        if (defaultSlideId && slides.length > 0) {
          requests.push({ deleteObject: { objectId: defaultSlideId } });
        }

        // Create each slide
        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          const slideId = `slide_${i}`;
          const layoutName = LAYOUTS[slide.layout || 'title_body'] || 'TITLE_AND_BODY';

          // Create slide with predefined layout
          requests.push({
            createSlide: {
              objectId: slideId,
              insertionIndex: i,
              slideLayoutReference: { predefinedLayout: layoutName },
            },
          });
        }

        // Apply batch to create all slides
        if (requests.length > 0) {
          await slidesFetch(`/${presId}:batchUpdate`, t.token, {
            method: 'POST',
            body: JSON.stringify({ requests }),
          });
        }

        // 4. Re-fetch to get placeholder IDs
        const updated = await slidesFetch(`/${presId}`, t.token);

        // 5. Insert text into placeholders
        const textRequests: any[] = [];
        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          const actualSlide = updated.slides?.[i];
          if (!actualSlide) continue;

          // Find title and body placeholders
          const elements = actualSlide.pageElements || [];
          for (const el of elements) {
            const ph = el.shape?.placeholder;
            if (!ph) continue;

            if (ph.type === 'TITLE' || ph.type === 'CENTERED_TITLE') {
              if (slide.title) {
                textRequests.push({
                  insertText: {
                    objectId: el.objectId,
                    text: slide.title,
                    insertionIndex: 0,
                  },
                });
              }
            } else if (ph.type === 'BODY' || ph.type === 'SUBTITLE') {
              if (slide.body) {
                textRequests.push({
                  insertText: {
                    objectId: el.objectId,
                    text: slide.body,
                    insertionIndex: 0,
                  },
                });
              }
            }
          }

          // Speaker notes
          if (slide.speaker_notes && actualSlide.slideProperties?.notesPage) {
            const notesElements = actualSlide.slideProperties.notesPage.pageElements || [];
            for (const el of notesElements) {
              if (el.shape?.placeholder?.type === 'BODY') {
                textRequests.push({
                  insertText: {
                    objectId: el.objectId,
                    text: slide.speaker_notes,
                    insertionIndex: 0,
                  },
                });
                break;
              }
            }
          }
        }

        if (textRequests.length > 0) {
          await slidesFetch(`/${presId}:batchUpdate`, t.token, {
            method: 'POST',
            body: JSON.stringify({ requests: textRequests }),
          });
        }

        const url = `https://docs.google.com/presentation/d/${presId}/edit`;
        return { content: [{ type: 'text' as const, text: `✅ Presentation created: "${title}" (${slides.length} slides)\n🔗 ${url}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Slides error: ${e.message}` }] };
      }
    },
  );

  const addSlides = tool(
    'add_slides_to_presentation',
    'Add more slides to an existing Google Slides presentation.',
    {
      presentation_id: z.string().describe('Presentation ID (from the URL)'),
      slides: z.array(z.object({
        layout: z.string().optional().describe('Layout type (default: title_body)'),
        title: z.string().optional().describe('Slide title'),
        body: z.string().optional().describe('Slide body text'),
      })).describe('Slides to add'),
    },
    async ({ presentation_id, slides }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Get current slide count
        const pres = await slidesFetch(`/${presentation_id}`, t.token);
        const startIndex = pres.slides?.length || 0;

        const requests: any[] = [];
        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          const slideId = `added_slide_${Date.now()}_${i}`;
          requests.push({
            createSlide: {
              objectId: slideId,
              insertionIndex: startIndex + i,
              slideLayoutReference: { predefinedLayout: LAYOUTS[slide.layout || 'title_body'] || 'TITLE_AND_BODY' },
            },
          });
        }

        await slidesFetch(`/${presentation_id}:batchUpdate`, t.token, {
          method: 'POST', body: JSON.stringify({ requests }),
        });

        // Re-fetch and add text
        const updated = await slidesFetch(`/${presentation_id}`, t.token);
        const textRequests: any[] = [];
        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          const actualSlide = updated.slides?.[startIndex + i];
          if (!actualSlide) continue;
          for (const el of (actualSlide.pageElements || [])) {
            const ph = el.shape?.placeholder;
            if (!ph) continue;
            if ((ph.type === 'TITLE' || ph.type === 'CENTERED_TITLE') && slide.title) {
              textRequests.push({ insertText: { objectId: el.objectId, text: slide.title, insertionIndex: 0 } });
            } else if ((ph.type === 'BODY' || ph.type === 'SUBTITLE') && slide.body) {
              textRequests.push({ insertText: { objectId: el.objectId, text: slide.body, insertionIndex: 0 } });
            }
          }
        }
        if (textRequests.length > 0) {
          await slidesFetch(`/${presentation_id}:batchUpdate`, t.token, {
            method: 'POST', body: JSON.stringify({ requests: textRequests }),
          });
        }

        return { content: [{ type: 'text' as const, text: `✅ ${slides.length} slides added.\n🔗 https://docs.google.com/presentation/d/${presentation_id}/edit` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Slides error: ${e.message}` }] };
      }
    },
  );

  const copyAndFillTemplate = tool(
    'copy_template_presentation',
    `Copy a Google Slides template and replace placeholder variables with actual values.
Use this when the user wants to generate a presentation from an existing template.

Flow:
1. Search Drive for the template by name (or user provides the presentation ID directly)
2. Call this tool with the template ID and the variable replacements
3. The tool copies the template, replaces all {{key}} placeholders in every slide, and returns the new presentation URL

Placeholders in the template use {{key}} format, e.g. {{company_name}}, {{revenue}}, {{date}}.
The replacements parameter maps each key to its value (without the braces).`,
    {
      template_id: z.string().describe('Google Slides presentation ID of the template to copy'),
      new_title: z.string().describe('Title for the new copy'),
      replacements: z.record(z.string()).describe('Map of placeholder key → value. E.g. {"company_name": "Acme", "revenue": "$1.2M"}. Keys should NOT include {{ }}'),
      folder_id: z.string().optional().describe('Drive folder ID to place the copy in (optional)'),
    },
    async ({ template_id, new_title, replacements, folder_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // 1. Copy the template via Drive API
        const copyBody: any = { name: new_title };
        if (folder_id) copyBody.parents = [folder_id];
        const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${template_id}/copy`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(copyBody),
        });
        const copy = await copyRes.json();
        if (!copyRes.ok) throw new Error(`Copy failed: ${copy?.error?.message || JSON.stringify(copy).substring(0, 200)}`);
        const newId = copy.id;

        // 2. Build replaceAllText requests for each placeholder
        const requests = Object.entries(replacements).map(([key, value]) => ({
          replaceAllText: {
            containsText: { text: `{{${key}}}`, matchCase: false },
            replaceText: value,
          },
        }));

        if (requests.length > 0) {
          await slidesFetch(`/${newId}:batchUpdate`, t.token, {
            method: 'POST',
            body: JSON.stringify({ requests }),
          });
        }

        const url = `https://docs.google.com/presentation/d/${newId}/edit`;
        return { content: [{ type: 'text' as const, text: `✅ Presentation created from template: "${new_title}"\n📝 ${Object.keys(replacements).length} variables replaced\n🔗 ${url}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Template copy error: ${e.message}` }] };
      }
    },
  );

  const exportPdf = tool(
    'export_presentation_pdf',
    `Export a Google Slides presentation as PDF.
Saves the PDF to Google Drive and returns a shareable download link.
Use when the user asks for a PDF version of a presentation.`,
    {
      presentation_id: z.string().describe('Google Slides presentation ID (from the URL)'),
      filename: z.string().optional().describe('PDF filename (default: presentation title + .pdf)'),
      folder_id: z.string().optional().describe('Drive folder ID to save PDF in (optional, defaults to root)'),
    },
    async ({ presentation_id, filename, folder_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // 1. Get presentation title if no filename provided
        let pdfName = filename;
        if (!pdfName) {
          const pres = await slidesFetch(`/${presentation_id}?fields=title`, t.token);
          pdfName = `${pres.title || 'presentation'}.pdf`;
        }
        if (!pdfName.endsWith('.pdf')) pdfName += '.pdf';

        // 2. Export as PDF via Drive API
        const exportRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${presentation_id}/export?mimeType=application/pdf`,
          { headers: { Authorization: `Bearer ${t.token}` } },
        );
        if (!exportRes.ok) {
          const errText = await exportRes.text();
          throw new Error(`PDF export failed (${exportRes.status}): ${errText.substring(0, 200)}`);
        }
        const pdfBuffer = await exportRes.arrayBuffer();

        // 3. Upload PDF to Drive
        const metadata: any = { name: pdfName, mimeType: 'application/pdf' };
        if (folder_id) metadata.parents = [folder_id];

        // Multipart upload: metadata + file content
        const boundary = `boundary_${Date.now()}`;
        const metaPart = JSON.stringify(metadata);
        const encoder = new TextEncoder();
        const parts = [
          encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`),
          encoder.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
          new Uint8Array(pdfBuffer),
          encoder.encode(`\r\n--${boundary}--`),
        ];
        // Combine parts
        const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
        const body = new Uint8Array(totalLen);
        let offset = 0;
        for (const p of parts) { body.set(p, offset); offset += p.byteLength; }

        const uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${t.token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
          },
        );
        const uploaded = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploaded?.error?.message || JSON.stringify(uploaded).substring(0, 200)}`);

        // 4. Make the file readable by anyone with link
        await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        }).catch(() => {}); // non-blocking, might fail on restricted domains

        const downloadLink = `https://drive.google.com/uc?export=download&id=${uploaded.id}`;
        const viewLink = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;

        return { content: [{ type: 'text' as const, text: `✅ PDF exported: "${pdfName}" (${Math.round(pdfBuffer.byteLength / 1024)}KB)\n👁️ View: ${viewLink}\n⬇️ Download: ${downloadLink}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `PDF export error: ${e.message}` }] };
      }
    },
  );

  return [createPresentation, addSlides, copyAndFillTemplate, exportPdf];
}
