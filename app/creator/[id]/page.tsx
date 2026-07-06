"use client";

import { useParams, useRouter } from "next/navigation";
import { SessionChat } from "@/components/sessions/SessionChat";

/**
 * Direct/deep link into an existing Creator session (bookmark, or a page
 * refresh after SessionWorkspace's silent URL update). The primary "pick a
 * reference and go" flow never lands here — it stays on `/creator` — so
 * "back" here is a real navigation, unlike the inline workspace's in-place
 * `onBack`.
 */
export default function CreatorSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  return <SessionChat sessionId={id} mode="creator" onBack={() => router.push("/creator")} />;
}
