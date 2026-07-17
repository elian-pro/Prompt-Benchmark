-- Sprint 14: optional opening message the team can set when starting a
-- Playground conversation, so the bot has already "spoken" (e.g. a WhatsApp
-- greeting) when the chat opens, instead of always waiting on the human to
-- send the first message. Stored on the session (not just inserted as a
-- message) so it can be replayed as turn 1 whenever a fresh round starts:
-- reset ("empieza de cero") and switching version both already start a new
-- round, and should feel equally "fresh" whether or not a greeting was set.

alter table demo_sessions add column opening_message text;
