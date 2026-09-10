/**
 * The Library's list, with the clients of one account pulled together.
 *
 * An account's block sits where its first client falls in the chosen order, and
 * its clients keep that order inside it, so sorting still means what it says.
 * Clients without an account stay loose. Accounts match ignoring case and
 * surrounding spaces: "Badell Law" and "badell law " are one company, not two
 * groups. The block is named after the first client's spelling.
 *
 * Pure, so the grouping can be tested without rendering the page.
 */
export type LibraryBlock<T> =
  | { kind: "client"; client: T }
  | { kind: "account"; name: string; clients: T[] };

export function groupByAccount<T extends { account: string | null }>(
  sorted: T[],
): LibraryBlock<T>[] {
  const blocks: LibraryBlock<T>[] = [];
  const members = new Map<string, T[]>();

  for (const client of sorted) {
    const name = client.account?.trim();
    if (!name) {
      blocks.push({ kind: "client", client });
      continue;
    }
    const key = name.toLocaleLowerCase("es");
    const group = members.get(key);
    if (group) {
      group.push(client);
      continue;
    }
    const clients = [client];
    members.set(key, clients);
    blocks.push({ kind: "account", name, clients });
  }
  return blocks;
}
