"use client";

import { useEffect, useId, useState, type InputHTMLAttributes } from "react";

import type { ClientSummary } from "@/lib/db/clients";

type Props = { value: string; onChange: (value: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "list"
>;

/**
 * Free-text account field that suggests the accounts already in use, through
 * the browser's own datalist. The Library groups clients by this name, so
 * picking "Badell Law" from the list instead of retyping it is what keeps one
 * company from turning into two groups.
 */
export function AccountInput({ value, onChange, ...rest }: Props) {
  const listId = useId();
  const [accounts, setAccounts] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/clients?filter=all")
      .then((res) => (res.ok ? res.json() : []))
      .then((clients: ClientSummary[]) => {
        const names = clients.map((c) => c.account?.trim()).filter((a): a is string => Boolean(a));
        setAccounts([...new Set(names)].sort((a, b) => a.localeCompare(b, "es")));
      })
      // Suggestions are a convenience: typing the account still works without them.
      .catch(() => {});
  }, []);

  return (
    <>
      <input
        className="input"
        list={listId}
        maxLength={80}
        placeholder="Ej: Badell Law"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      <datalist id={listId}>
        {accounts.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </>
  );
}
