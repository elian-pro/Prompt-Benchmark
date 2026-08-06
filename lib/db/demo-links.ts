/**
 * Data access for demo links (Sprint 18): the shareable URL a client opens to
 * test their agent and leave feedback, replacing the Google Doc of screenshots
 * that used to come back over WhatsApp.
 *
 * A link is a round of testing: one client, one frozen version, many people.
 * Whoever opens it gets their own conversation (see `createLinkSession` in
 * `demo-sessions.ts`), and every one of those conversations is visible to the
 * user, who is the only one who can approve a note or reach the Editor.
 *
 * The token in the URL is the entire access control. There is no login on the
 * public side, so it is random, long, and revocable by closing the link.
 */
import { getSupabase } from "../supabase";
import { getVersion } from "./versions";
import { getRoleDefault } from "./role-defaults";
import { RoleNotConfiguredError } from "./runs";
import { LINK_TOKEN_BYTES, randomToken } from "../auth/signed-token.ts";

export type DemoLinkStatus = "active" | "closed";

export type DemoLink = {
  id: string;
  token: string;
  client_id: string;
  version_id: string | null;
  version_number_snapshot: string;
  prompt_snapshot: string;
  opening_message: string | null;
  label: string | null;
  status: DemoLinkStatus;
  max_sessions: number;
  max_messages: number;
  created_at: string;
  closed_at: string | null;
  /** The last day the client can leave reports, inclusive, read in Mexico City
   *  time. Null means no deadline. See lib/business-days.ts. */
  expires_on: string | null;
};

export type DemoLinkListItem = DemoLink & {
  client_name: string | null;
  session_count: number;
  pending_notes: number;
};

const LINK_COLS =
  "id, token, client_id, version_id, version_number_snapshot, prompt_snapshot, " +
  "opening_message, label, status, max_sessions, max_messages, created_at, closed_at, " +
  "expires_on";

export async function createLink(input: {
  clientId: string;
  versionId: string;
  openingMessage?: string;
  label?: string;
  maxSessions?: number;
  maxMessages?: number;
  /** YYYY-MM-DD, or null for a link that stays open until someone closes it. */
  expiresOn?: string | null;
}): Promise<DemoLink> {
  const version = await getVersion(input.versionId);
  if (!version) throw new Error("La versión a probar no existe.");
  if (version.client_id !== input.clientId) {
    throw new Error("La versión no pertenece al cliente indicado.");
  }
  // Same check the Playground does, and for the same reason: better to fail
  // here than to hand a client a link that answers with an error.
  const role = await getRoleDefault("test_bot");
  if (!role) {
    throw new RoleNotConfiguredError(
      "No hay un modelo asignado al rol Bot de prueba. Configúralo en Configuración.",
    );
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_links")
    .insert({
      token: randomToken(LINK_TOKEN_BYTES),
      client_id: input.clientId,
      version_id: input.versionId,
      version_number_snapshot: version.version_number,
      prompt_snapshot: version.content,
      opening_message: input.openingMessage?.trim() || null,
      label: input.label?.trim() || null,
      status: "active",
      expires_on: input.expiresOn ?? null,
      ...(input.maxSessions ? { max_sessions: input.maxSessions } : {}),
      ...(input.maxMessages ? { max_messages: input.maxMessages } : {}),
    })
    .select(LINK_COLS)
    .single();
  if (error) throw new Error(`No se pudo crear el link: ${error.message}`);
  return data as unknown as DemoLink;
}

/** Resolves the token from the URL. Returns null for anything unknown, so the
 *  public routes can answer 404 without distinguishing "never existed" from
 *  "deleted", which is what makes guessing tokens pointless. */
export async function getLinkByToken(token: string): Promise<DemoLink | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_links")
    .select(LINK_COLS)
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener el link: ${error.message}`);
  return (data as unknown as DemoLink) ?? null;
}

export async function getLink(id: string): Promise<DemoLink | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_links")
    .select(LINK_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener el link: ${error.message}`);
  return (data as unknown as DemoLink) ?? null;
}

/**
 * Every link, newest first, with the two numbers the list actually needs:
 * how many people have used it and how many of their notes are still waiting
 * on the user. Both are counted in one round trip through the embedded
 * selects rather than N queries.
 */
export async function listLinks(clientId?: string): Promise<DemoLinkListItem[]> {
  const sb = getSupabase();
  let query = sb
    .from("demo_links")
    .select(`${LINK_COLS}, clients(name), demo_sessions(id, demo_notes(id, status))`);
  if (clientId) query = query.eq("client_id", clientId);
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron listar los links: ${error.message}`);

  return (data ?? []).map((row: any) => {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const sessions: any[] = Array.isArray(row.demo_sessions) ? row.demo_sessions : [];
    const { clients: _c, demo_sessions: _s, ...link } = row;
    const pending = sessions.reduce((total, session) => {
      const notes: any[] = Array.isArray(session.demo_notes) ? session.demo_notes : [];
      return total + notes.filter((n) => n.status === "pending").length;
    }, 0);
    return {
      ...(link as DemoLink),
      client_name: client?.name ?? null,
      session_count: sessions.length,
      pending_notes: pending,
    };
  });
}

/** How many conversations a link already holds, for the `max_sessions` cap. */
export async function countLinkSessions(linkId: string): Promise<number> {
  const sb = getSupabase();
  const { count, error } = await sb
    .from("demo_sessions")
    .select("id", { count: "exact", head: true })
    .eq("link_id", linkId);
  if (error) throw new Error(`No se pudieron contar las conversaciones: ${error.message}`);
  return count ?? 0;
}

export type LinkSessionListItem = {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  visitor_ip: string | null;
  visitor_user_agent: string | null;
  /** Across every round, matching the transcript the admin opens. */
  message_count: number;
  /** How many times this visitor started over. 1 means they never did. */
  round_count: number;
  note_count: number;
  pending_notes: number;
};

/** The conversations of one link, for the admin's left column. */
export async function listLinkSessions(linkId: string): Promise<LinkSessionListItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_sessions")
    .select(
      "id, created_at, last_seen_at, visitor_ip, visitor_user_agent, current_round, " +
        "demo_messages(id, round), demo_notes(id, status)",
    )
    .eq("link_id", linkId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron listar las conversaciones: ${error.message}`);

  return (data ?? []).map((row: any) => {
    const messages: any[] = Array.isArray(row.demo_messages) ? row.demo_messages : [];
    const notes: any[] = Array.isArray(row.demo_notes) ? row.demo_notes : [];
    return {
      id: row.id,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      visitor_ip: row.visitor_ip,
      visitor_user_agent: row.visitor_user_agent,
      message_count: messages.length,
      round_count: row.current_round ?? 1,
      note_count: notes.length,
      pending_notes: notes.filter((n) => n.status === "pending").length,
    };
  });
}

/** How many messages this visitor has already sent, for the `max_messages`
 *  cap. Counts every round, since a cap that resets is not a cap. */
export async function countSessionMessages(sessionId: string): Promise<number> {
  const sb = getSupabase();
  const { count, error } = await sb
    .from("demo_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("role", "human");
  if (error) throw new Error(`No se pudieron contar los mensajes: ${error.message}`);
  return count ?? 0;
}

/** Closing is the revoke: the URL stops working, the conversations stay. */
export async function closeLink(id: string): Promise<DemoLink> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_links")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id)
    .select(LINK_COLS)
    .single();
  if (error) throw new Error(`No se pudo cerrar el link: ${error.message}`);
  return data as unknown as DemoLink;
}

/** The deadline, set or cleared. Separate from close/reopen because they mean
 *  different things: this is when the link stops on its own, that is a person
 *  deciding it stops now. */
export async function setLinkExpiry(id: string, expiresOn: string | null): Promise<DemoLink> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_links")
    .update({ expires_on: expiresOn })
    .eq("id", id)
    .select(LINK_COLS)
    .single();
  if (error) throw new Error(`No se pudo cambiar la fecha de cierre: ${error.message}`);
  return data as unknown as DemoLink;
}

export async function reopenLink(id: string): Promise<DemoLink> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_links")
    .update({ status: "active", closed_at: null })
    .eq("id", id)
    .select(LINK_COLS)
    .single();
  if (error) throw new Error(`No se pudo reabrir el link: ${error.message}`);
  return data as unknown as DemoLink;
}

/** Deletes the link and, by cascade, every conversation and note under it.
 *  This is the only way a client's demo conversation is ever removed, which
 *  is why the UI puts it behind the two-step confirmation. */
export async function deleteLink(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("demo_links").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el link: ${error.message}`);
}

export type PendingNotesSummary = {
  total: number;
  by_link: { link_id: string; client_name: string | null; label: string | null; count: number }[];
};

/**
 * Feeds the badge in the header. One query over pending notes, grouped in
 * memory: the volume here is a handful of notes per round, so a join beats
 * three round trips and there is nothing to paginate.
 */
export async function pendingNotesSummary(): Promise<PendingNotesSummary> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_notes")
    .select("id, demo_sessions!inner(link_id, demo_links!inner(id, label, clients(name)))")
    .eq("status", "pending");
  if (error) throw new Error(`No se pudieron contar las notas pendientes: ${error.message}`);

  const byLink = new Map<string, PendingNotesSummary["by_link"][number]>();
  for (const row of (data ?? []) as any[]) {
    const session = Array.isArray(row.demo_sessions) ? row.demo_sessions[0] : row.demo_sessions;
    const link = Array.isArray(session?.demo_links) ? session.demo_links[0] : session?.demo_links;
    if (!link) continue;
    const client = Array.isArray(link.clients) ? link.clients[0] : link.clients;
    const entry = byLink.get(link.id) ?? {
      link_id: link.id,
      client_name: client?.name ?? null,
      label: link.label ?? null,
      count: 0,
    };
    entry.count += 1;
    byLink.set(link.id, entry);
  }

  const list = [...byLink.values()].sort((a, b) => b.count - a.count);
  return { total: list.reduce((n, l) => n + l.count, 0), by_link: list };
}
