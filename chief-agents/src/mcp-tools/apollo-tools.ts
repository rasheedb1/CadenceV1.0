/**
 * Apollo.io tools — prospect search and enrichment.
 * Requires 'apollo' capability. Auth: APOLLO_API_KEY env var.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';

const APOLLO_KEY = process.env.APOLLO_API_KEY || '';
const APOLLO_BASE = 'https://api.apollo.io/v1';

async function apolloPost(path: string, body: any): Promise<any> {
  if (!APOLLO_KEY) throw new Error('APOLLO_API_KEY not configured');
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_KEY },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function buildApolloTools(_agent: AgentConfig): any[] {
  const searchPeople = tool(
    'apollo_search_people',
    'Search Apollo.io for people/prospects. Filter by title, company, location, industry. Returns name, title, company, email, LinkedIn.',
    {
      person_titles: z.array(z.string()).optional().describe('Job titles to search (e.g. ["CEO","CTO"])'),
      organization_name: z.string().optional().describe('Company name'),
      person_locations: z.array(z.string()).optional().describe('Locations (e.g. ["Mexico City","Bogota"])'),
      organization_industry: z.string().optional().describe('Industry keyword'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ person_titles, organization_name, person_locations, organization_industry, limit }) => {
      try {
        const body: any = { per_page: Math.min(limit || 10, 25) };
        if (person_titles?.length) body.person_titles = person_titles;
        if (organization_name) body.q_organization_name = organization_name;
        if (person_locations?.length) body.person_locations = person_locations;
        if (organization_industry) body.organization_industry_tag_ids = [organization_industry];
        const data = await apolloPost('/mixed_people/search', body);
        const people = data.people || [];
        if (people.length === 0) return { content: [{ type: 'text' as const, text: 'No prospects found.' }] };
        const lines = people.map((p: any, i: number) =>
          `${i + 1}. ${p.name} — ${p.title || '?'}\n   🏢 ${p.organization?.name || '?'} | 📧 ${p.email || 'N/A'}\n   🔗 ${p.linkedin_url || ''}`
        ).join('\n');
        return { content: [{ type: 'text' as const, text: `Apollo results (${people.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Apollo error: ${e.message}` }] };
      }
    },
  );

  const enrichPerson = tool(
    'apollo_enrich_person',
    'Enrich a person via Apollo — get full profile + verified email from name + company.',
    {
      first_name: z.string().describe('First name'),
      last_name: z.string().describe('Last name'),
      organization_name: z.string().describe('Company name'),
      email: z.string().optional().describe('Known email (for better match)'),
    },
    async ({ first_name, last_name, organization_name, email }) => {
      try {
        const body: any = { first_name, last_name, organization_name };
        if (email) body.email = email;
        const data = await apolloPost('/people/match', body);
        const p = data.person;
        if (!p) return { content: [{ type: 'text' as const, text: 'No match found in Apollo.' }] };
        const text = `${p.name} — ${p.title || '?'}\n🏢 ${p.organization?.name || '?'}\n📧 ${p.email || 'N/A'} (${p.email_status || '?'})\n📱 ${p.phone_numbers?.map((ph: any) => ph.raw_number).join(', ') || 'N/A'}\n📍 ${p.city || ''}, ${p.state || ''}, ${p.country || ''}\n🔗 ${p.linkedin_url || ''}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Apollo error: ${e.message}` }] };
      }
    },
  );

  const searchCompanies = tool(
    'apollo_search_companies',
    'Search Apollo for companies by industry, size, location. Returns name, domain, employee count, industry.',
    {
      query: z.string().optional().describe('Company name or keyword'),
      industry: z.string().optional().describe('Industry keyword'),
      employee_ranges: z.array(z.string()).optional().describe('Size ranges: "1,10", "11,50", "51,200", "201,500", "501,1000", "1001,5000"'),
      locations: z.array(z.string()).optional().describe('HQ locations'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ query, industry, employee_ranges, locations, limit }) => {
      try {
        const body: any = { per_page: Math.min(limit || 10, 25) };
        if (query) body.q_organization_name = query;
        if (industry) body.organization_industry_tag_ids = [industry];
        if (employee_ranges?.length) body.organization_num_employees_ranges = employee_ranges;
        if (locations?.length) body.organization_locations = locations;
        const data = await apolloPost('/mixed_companies/search', body);
        const orgs = data.organizations || [];
        if (orgs.length === 0) return { content: [{ type: 'text' as const, text: 'No companies found.' }] };
        const lines = orgs.map((o: any, i: number) =>
          `${i + 1}. ${o.name} — ${o.industry || '?'}\n   🌐 ${o.primary_domain || '?'} | 👥 ${o.estimated_num_employees || '?'} employees\n   📍 ${o.city || ''}, ${o.country || ''}`
        ).join('\n');
        return { content: [{ type: 'text' as const, text: `Companies (${orgs.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Apollo error: ${e.message}` }] };
      }
    },
  );

  return [searchPeople, enrichPerson, searchCompanies];
}
