/**
 * Calendar tools — Google Calendar API direct.
 * Reuses the same Google OAuth token as inbox (via getFreshGoogleToken).
 * Requires the 'calendar' capability on the agent.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { getFreshGoogleToken } from '../utils/google-auth.js';

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

async function calFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar API ${res.status}: ${data?.error?.message || JSON.stringify(data).substring(0, 200)}`);
  return data;
}

export function buildCalendarTools(agent: AgentConfig): any[] {
  async function ensureToken(): Promise<{ token: string } | { error: string }> {
    const t = await getFreshGoogleToken(agent.orgId);
    if (!t) return { error: 'Google not connected or calendar scope not authorized. Ask user to reconnect Gmail (includes calendar scope).' };
    return { token: t.accessToken };
  }

  const listEvents = tool(
    'list_calendar_events',
    'List upcoming events from the user Google Calendar. Returns title, time, attendees, location. Use for scheduling, daily briefing, or meeting prep.',
    {
      days_ahead: z.number().optional().describe('How many days ahead to look (default 7, max 30)'),
      max_results: z.number().optional().describe('Max events (default 20, max 50)'),
      query: z.string().optional().describe('Optional search query to filter events by title/description'),
    },
    async ({ days_ahead, max_results, query }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      const now = new Date();
      const end = new Date(now.getTime() + (days_ahead || 7) * 86400000);
      let path = `/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&maxResults=${Math.min(max_results || 20, 50)}&singleEvents=true&orderBy=startTime`;
      if (query) path += `&q=${encodeURIComponent(query)}`;
      try {
        const data = await calFetch(path, t.token);
        const events = data.items || [];
        if (events.length === 0) return { content: [{ type: 'text' as const, text: 'No events found.' }] };
        const lines = events.map((e: any, i: number) => {
          const start = e.start?.dateTime || e.start?.date || '?';
          const end = e.end?.dateTime || e.end?.date || '';
          const attendees = (e.attendees || []).map((a: any) => a.email).join(', ');
          return `${i + 1}. ${start} — ${end}\n   📌 ${e.summary || '(no title)'}\n   ${e.location ? `📍 ${e.location}\n   ` : ''}${attendees ? `👥 ${attendees}` : ''}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Found ${events.length} events:\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Calendar error: ${e.message}` }] };
      }
    },
  );

  const createEvent = tool(
    'create_calendar_event',
    'Create a new event in the user Google Calendar. Returns the event link.',
    {
      title: z.string().describe('Event title'),
      start: z.string().describe('Start time ISO 8601 (e.g. 2026-04-15T10:00:00-06:00)'),
      end: z.string().describe('End time ISO 8601'),
      description: z.string().optional().describe('Event description/notes'),
      location: z.string().optional().describe('Location or meeting link'),
      attendees: z.array(z.string()).optional().describe('Array of attendee email addresses'),
    },
    async ({ title, start, end, description, location, attendees }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const body: any = {
          summary: title,
          start: { dateTime: start },
          end: { dateTime: end },
        };
        if (description) body.description = description;
        if (location) body.location = location;
        if (attendees?.length) body.attendees = attendees.map(e => ({ email: e }));
        const data = await calFetch('/calendars/primary/events', t.token, {
          method: 'POST', body: JSON.stringify(body),
        });
        return { content: [{ type: 'text' as const, text: `✅ Event created: ${data.summary}\n🔗 ${data.htmlLink}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Calendar error: ${e.message}` }] };
      }
    },
  );

  const findFreeSlots = tool(
    'find_free_slots',
    'Find free time slots in the user calendar for a given day. Use for scheduling meetings or suggesting available times.',
    {
      date: z.string().describe('Date to check (YYYY-MM-DD)'),
      duration_minutes: z.number().optional().describe('Desired slot duration in minutes (default 30)'),
      start_hour: z.number().optional().describe('Business start hour (default 9)'),
      end_hour: z.number().optional().describe('Business end hour (default 18)'),
    },
    async ({ date, duration_minutes, start_hour, end_hour }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const dayStart = `${date}T${String(start_hour || 9).padStart(2, '0')}:00:00`;
        const dayEnd = `${date}T${String(end_hour || 18).padStart(2, '0')}:00:00`;
        const path = `/calendars/primary/events?timeMin=${dayStart}Z&timeMax=${dayEnd}Z&singleEvents=true&orderBy=startTime&maxResults=50`;
        const data = await calFetch(path, t.token);
        const events = (data.items || []).filter((e: any) => e.start?.dateTime);
        const dur = (duration_minutes || 30) * 60000;
        const slots: string[] = [];
        let cursor = new Date(`${dayStart}Z`).getTime();
        const endMs = new Date(`${dayEnd}Z`).getTime();
        for (const ev of events) {
          const evStart = new Date(ev.start.dateTime).getTime();
          if (evStart - cursor >= dur) {
            slots.push(`${new Date(cursor).toISOString().substring(11, 16)} — ${new Date(evStart).toISOString().substring(11, 16)}`);
          }
          const evEnd = new Date(ev.end?.dateTime || ev.start.dateTime).getTime();
          cursor = Math.max(cursor, evEnd);
        }
        if (endMs - cursor >= dur) {
          slots.push(`${new Date(cursor).toISOString().substring(11, 16)} — ${new Date(endMs).toISOString().substring(11, 16)}`);
        }
        if (slots.length === 0) return { content: [{ type: 'text' as const, text: `No free ${duration_minutes || 30}min slots on ${date}.` }] };
        return { content: [{ type: 'text' as const, text: `Free slots on ${date} (${duration_minutes || 30}min):\n${slots.map((s, i) => `${i + 1}. ${s}`).join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Calendar error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Update Event ===
  const updateEvent = tool(
    'update_calendar_event',
    'Update an existing Google Calendar event. Can change title, time, attendees, description, location. Use event ID from list_calendar_events.',
    {
      event_id: z.string().describe('Event ID (from list_calendar_events)'),
      title: z.string().optional().describe('New title'),
      start: z.string().optional().describe('New start time (ISO 8601)'),
      end: z.string().optional().describe('New end time (ISO 8601)'),
      description: z.string().optional().describe('New description'),
      location: z.string().optional().describe('New location'),
      add_attendees: z.array(z.string()).optional().describe('Email addresses to ADD to the event'),
      remove_attendees: z.array(z.string()).optional().describe('Email addresses to REMOVE from the event'),
    },
    async ({ event_id, title, start, end, description, location, add_attendees, remove_attendees }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Get current event to merge attendees
        const current = await calFetch(`/calendars/primary/events/${event_id}`, t.token);
        const body: any = {};
        if (title) body.summary = title;
        if (start) body.start = { dateTime: start };
        if (end) body.end = { dateTime: end };
        if (description !== undefined) body.description = description;
        if (location !== undefined) body.location = location;
        if (add_attendees?.length || remove_attendees?.length) {
          let attendees = (current.attendees || []).map((a: any) => ({ email: a.email }));
          if (remove_attendees?.length) attendees = attendees.filter((a: any) => !remove_attendees.includes(a.email));
          if (add_attendees?.length) attendees.push(...add_attendees.map(e => ({ email: e })));
          body.attendees = attendees;
        }
        const data = await calFetch(`/calendars/primary/events/${event_id}`, t.token, {
          method: 'PATCH', body: JSON.stringify(body),
        });
        return { content: [{ type: 'text' as const, text: `✅ Event updated: ${data.summary}\n🔗 ${data.htmlLink}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Calendar error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Delete Event ===
  const deleteEvent = tool(
    'delete_calendar_event',
    'Delete/cancel a Google Calendar event. Use event ID from list_calendar_events.',
    {
      event_id: z.string().describe('Event ID to delete'),
      notify_attendees: z.boolean().optional().describe('Send cancellation emails to attendees (default true)'),
    },
    async ({ event_id, notify_attendees }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const notify = notify_attendees !== false ? 'all' : 'none';
        await fetch(`${CAL_BASE}/calendars/primary/events/${event_id}?sendUpdates=${notify}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${t.token}` },
        });
        return { content: [{ type: 'text' as const, text: `✅ Event deleted${notify_attendees !== false ? ' — cancellation sent to attendees' : ''}.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Calendar error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Check Other People's Free/Busy ===
  const freeBusy = tool(
    'check_availability',
    'Check free/busy status of one or more people for scheduling. Works with any Google Workspace user in the same organization.',
    {
      emails: z.array(z.string()).describe('Email addresses to check availability'),
      date: z.string().describe('Date to check (YYYY-MM-DD)'),
      start_hour: z.number().optional().describe('Start hour (default 9)'),
      end_hour: z.number().optional().describe('End hour (default 18)'),
    },
    async ({ emails, date, start_hour, end_hour }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const timeMin = `${date}T${String(start_hour || 9).padStart(2, '0')}:00:00Z`;
        const timeMax = `${date}T${String(end_hour || 18).padStart(2, '0')}:00:00Z`;
        const data = await calFetch('/freeBusy', t.token, {
          method: 'POST',
          body: JSON.stringify({
            timeMin, timeMax,
            items: emails.map(e => ({ id: e })),
          }),
        });
        const lines = emails.map(email => {
          const cal = data.calendars?.[email];
          if (cal?.errors?.length) return `${email}: ⚠️ ${cal.errors[0].reason}`;
          const busy = cal?.busy || [];
          if (busy.length === 0) return `${email}: ✅ Free all day`;
          const slots = busy.map((b: any) => `${new Date(b.start).toISOString().substring(11, 16)}-${new Date(b.end).toISOString().substring(11, 16)}`).join(', ');
          return `${email}: 🔴 Busy: ${slots}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Availability on ${date}:\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Calendar error: ${e.message}` }] };
      }
    },
  );

  return [listEvents, createEvent, findFreeSlots, updateEvent, deleteEvent, freeBusy];
}
