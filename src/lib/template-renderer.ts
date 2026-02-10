/**
 * Renders a template string by replacing variable placeholders with actual values.
 * Supports both {{variable_name}} (double braces) and {variable_name} (single braces) syntax.
 *
 * @param template - The template string containing placeholders like {{variable_name}}
 * @param variables - A record of variable names to their values
 * @param options - Configuration options for rendering
 * @returns The rendered template string with placeholders replaced
 *
 * @example
 * renderTemplate("Hello {{first_name}}!", { first_name: "John" })
 * // Returns: "Hello John!"
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
  options: { keepMissingPlaceholders?: boolean } = {}
): string {
  const { keepMissingPlaceholders = true } = options

  // First, replace double-brace syntax: {{variable_name}}
  let result = template.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
    const value = variables[variableName]
    if (value !== undefined && value !== null) {
      return value
    }
    // If variable is missing, either keep the placeholder or return empty string
    return keepMissingPlaceholders ? match : ''
  })

  // Also support single-brace syntax for backward compatibility: {variable_name}
  result = result.replace(/\{(\w+)\}/g, (match, variableName) => {
    const value = variables[variableName]
    if (value !== undefined && value !== null) {
      return value
    }
    return keepMissingPlaceholders ? match : ''
  })

  return result
}

/**
 * Sample data for template preview
 */
export const SAMPLE_LEAD_DATA: Record<string, string> = {
  first_name: 'John',
  last_name: 'Smith',
  company: 'Acme Corp',
  title: 'VP of Sales',
  email: 'john.smith@acme.com',
  linkedin_url: 'https://linkedin.com/in/johnsmith',
}

/**
 * Available template variables
 */
export const TEMPLATE_VARIABLES = [
  { name: 'first_name', label: 'First Name', placeholder: '{{first_name}}' },
  { name: 'last_name', label: 'Last Name', placeholder: '{{last_name}}' },
  { name: 'company', label: 'Company', placeholder: '{{company}}' },
  { name: 'title', label: 'Title', placeholder: '{{title}}' },
  { name: 'email', label: 'Email', placeholder: '{{email}}' },
  { name: 'linkedin_url', label: 'LinkedIn URL', placeholder: '{{linkedin_url}}' },
] as const

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]['name']

/**
 * Converts a Lead object to a variables record for template rendering.
 *
 * @param lead - The lead object containing first_name, last_name, company, title, email, linkedin_url
 * @returns A record mapping variable names to their values
 */
export function leadToVariables(lead: {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  title?: string | null
  email?: string | null
  linkedin_url?: string | null
}): Record<string, string> {
  return {
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    company: lead.company || '',
    title: lead.title || '',
    email: lead.email || '',
    linkedin_url: lead.linkedin_url || '',
  }
}

/**
 * Renders a template with lead data.
 * This is a convenience function that combines leadToVariables and renderTemplate.
 *
 * @param template - The template string with {{variable}} placeholders
 * @param lead - The lead object
 * @param options - Rendering options
 * @returns The rendered template string
 */
export function renderTemplateWithLead(
  template: string,
  lead: {
    first_name?: string | null
    last_name?: string | null
    company?: string | null
    title?: string | null
    email?: string | null
    linkedin_url?: string | null
  },
  options: { keepMissingPlaceholders?: boolean } = {}
): string {
  return renderTemplate(template, leadToVariables(lead), options)
}
