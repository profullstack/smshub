import { groupsHandler } from "@/lib/groups-route";
import { sendToGroup } from "@/lib/groups";

/** Text every member: { message, from?, media_url?, except?: [phones] }. Members who said STOP are skipped. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return groupsHandler(request, (db, userId, body) => sendToGroup(db, userId, decodeURIComponent(id), body));
}
