Supabase-only deployment bundle
===============================

Use this archive if only Supabase deployment is needed.

Contents:
- supabase/config.toml
- supabase/functions/payment-init/index.ts
- supabase/functions/tbank-notification/index.ts
- supabase/functions/tochka-notification/index.ts
- deploy_supabase_all_in_one.bat
- secrets template

Run order on target machine:
1) set/update secrets from 02_set_secrets_template.txt
2) run deploy_supabase_all_in_one.bat

Project ref: vvkjfaxlzlmeobgitxdj
