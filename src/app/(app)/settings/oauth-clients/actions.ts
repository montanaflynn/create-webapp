"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { revokeTokenById } from "@/lib/services/oauth";
import type { Actor } from "@/lib/services/audit";
import { NotFoundError } from "@/lib/services/errors";

async function requireActor(): Promise<Actor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return { userId: session.user.id, principal: { kind: "session" } };
}

export type RevokeResult = { ok: true } | { ok: false; error: string };

export async function revokeConnectedAppAction(
  tokenId: string,
): Promise<RevokeResult> {
  const actor = await requireActor();
  try {
    await revokeTokenById(actor, tokenId);
    revalidatePath("/settings/oauth-clients");
    return { ok: true };
  } catch (e) {
    if (e instanceof NotFoundError) {
      return { ok: false, error: "Connection not found." };
    }
    throw e;
  }
}
