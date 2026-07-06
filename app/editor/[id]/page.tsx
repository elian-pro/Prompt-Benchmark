"use client";

import { useParams, useRouter } from "next/navigation";
import { DotGrid } from "@/components/sessions/DotGrid";
import { SessionChat } from "@/components/sessions/SessionChat";

/**
 * Direct/deep link into an existing Editor session (e.g. "Editar con IA" from
 * the Library, a bookmark, or a page refresh after SessionWorkspace's silent
 * URL update). The primary "pick a client and go" flow never lands here — it
 * stays on `/editor` — so "back" here is a real navigation, unlike the inline
 * workspace's in-place `onBack`.
 */
export default function EditorSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  return (
    <>
      <DotGrid />
      <SessionChat sessionId={id} mode="editor" onBack={() => router.push("/editor")} />
    </>
  );
}
