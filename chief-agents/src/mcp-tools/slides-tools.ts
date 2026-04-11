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

  return [createPresentation, addSlides];
}
