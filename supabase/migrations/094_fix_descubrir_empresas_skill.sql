-- Fix skill definition for descubrir_empresas: correct params to match actual edge function
UPDATE skill_registry
SET skill_definition = 'Calls discover-icp-companies edge function. Params: icpDescription (text describing the ideal customer profile), minCompanies (optional, default 5), maxCompanies (optional, default 15), excludedCompanies (optional, array of company names to skip). org_id is auto-injected.'
WHERE name = 'descubrir_empresas';
