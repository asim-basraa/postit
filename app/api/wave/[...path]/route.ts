import type { NextRequest } from "next/server";
import { waveHandlers } from "@/lib/wave";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

/** Every Wave endpoint. See @wave/server's createWaveHandlers for the list. */
async function handle(request: NextRequest, { params }: Params) {
  return waveHandlers(request, (await params).path);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
