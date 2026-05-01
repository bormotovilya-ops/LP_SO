---
name: supabase-mcp
description: Connect and use Supabase MCP in Cursor for database, docs, debugging, development, edge functions, and project tools. Use when the user asks to set up Supabase MCP, query Supabase via MCP, run SQL, inspect tables, fetch logs, or manage Supabase resources from Cursor.
disable-model-invocation: true
---

# Supabase MCP

## When to use

Use this skill when the user asks to:
- connect Supabase to Cursor via MCP
- run SQL against Supabase from the agent
- inspect tables, migrations, logs, advisors, or edge functions
- generate TypeScript types from schema

Reference docs: https://supabase.com/docs/guides/getting-started/mcp

## Setup workflow

1. Confirm target mode:
   - `hosted`: `https://mcp.supabase.com/mcp`
   - `local`: `http://localhost:54321/mcp`
2. Prefer project-scoped configuration when project ref is known:
   - `https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>`
3. In Cursor open `Settings -> Cursor Settings -> Tools & MCP`.
4. Add a Supabase MCP server and complete OAuth in browser.
5. Restart Cursor if tools are not discovered immediately.
6. Verify with a safe query prompt:
   - "List all tables in my Supabase database using MCP tools."

## Recommended hosted URLs

- Full access (selected):  
  `https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>`
- Read-only safer mode:  
  `https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>&read_only=true`
- Limit feature groups example:  
  `https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>&features=database,docs`

## Tool groups this skill assumes

- Database: `list_tables`, `list_extensions`, `list_migrations`, `apply_migration`, `execute_sql`
- Debugging: `get_logs`, `get_advisors`
- Development: `get_project_url`, `get_publishable_keys`, `generate_typescript_types`
- Edge Functions: `list_edge_functions`, `get_edge_function`, `deploy_edge_function`
- Account management (not in project-scoped mode): project and organization management tools
- Docs: `search_docs`
- Branching (experimental): branch lifecycle tools
- Storage: optional, disabled by default

## Operating rules

1. Ask before destructive actions:
   - DDL/DML writes (`DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `INSERT`)
   - migrations and edge function deploys
2. Prefer read operations first (`list_tables`, `execute_sql` with `SELECT`).
3. For production-like data, recommend switching to `read_only=true`.
4. When SQL fails, include:
   - attempted query
   - error text
   - minimal corrected query proposal

## Prompt templates

- "Use Supabase MCP tools to list all tables and summarize their purpose."
- "Use Supabase MCP to generate TypeScript types from the current schema."
- "Use Supabase MCP logs to inspect auth errors in the last 30 minutes."
- "Use Supabase MCP to list migrations and identify unapplied ones."

## CI/manual auth note

If OAuth is unavailable (CI), use bearer token header with project-scoped URL and environment variables for `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`, per official docs.
