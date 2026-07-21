-- Sprint 13: a quick, mandatory "where does this agent live" tag per client,
-- independent of whether the full technical n8n binding (connection + workflow
-- + node, or a manual label) has been set up yet. The Library card shows it as
-- a yellow tag right away; the detailed push/manual binding config in
-- n8n_bindings (mode api/manual) is still a separate, optional follow-up step.
--
-- Defaults existing rows to 'zebra': per docs/SPEC.md, "today the majority of
-- clients live in Zebra's own n8n".

alter table clients
  add column n8n_host text not null default 'zebra' check (n8n_host in ('zebra', 'own'));
