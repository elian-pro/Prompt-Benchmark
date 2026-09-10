-- The account a client belongs to: the real company behind one or more prompts.
-- A "client" in the Studio is one agent (its own prompt, n8n flow and history),
-- and some companies run several unrelated products, each with its own agent
-- (e.g. "Badell Law" and "Badell Law Mail"). Free text on purpose, like
-- `segment`: the Library groups by the exact value and suggests existing ones,
-- so a separate table would only add a join. Null means a standalone client.

alter table clients add column account text;
