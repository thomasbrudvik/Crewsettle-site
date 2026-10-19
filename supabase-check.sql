-- CrewSettle: security check. Read-only, changes nothing.
-- Supabase > SQL Editor > New query, paste all of this, press Run.
-- It returns one table. Send a screenshot of it.
select 'RLS' as check, tablename as item, case when rowsecurity then 'on' else 'OFF !!' end as result
  from pg_tables where schemaname = 'public'
union all
select 'policy', tablename || ': ' || policyname, cmd || ' for ' || array_to_string(roles, ',')
  from pg_policies where schemaname = 'public'
union all
select 'grant', table_name || ' to ' || grantee, string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by table_name, grantee
order by 1, 2;
