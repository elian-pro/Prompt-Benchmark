-- Sprint 11: lets the team give the adversarial lead a short, concrete brief
-- (e.g. "Eres un empresario, tienes un presupuesto de 20mdp y quieres una
-- casa") so it can answer the bot's profiling questions with coherent data
-- instead of improvising and getting classified as "no perfila". Optional:
-- existing runs and the default flow keep working without it.

alter table runs add column lead_brief text;
