import { groupsHandler } from "@/lib/groups-route";
import { addMembers } from "@/lib/groups";

/** Add members: { members: [{ phone, name? }] }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return groupsHandler(request, (db, userId, body) => addMembers(db, userId, decodeURIComponent(id), body.members));
}
