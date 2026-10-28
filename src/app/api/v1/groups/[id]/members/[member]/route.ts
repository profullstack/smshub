import { groupsHandler } from "@/lib/groups-route";
import { removeMember } from "@/lib/groups";

/** Remove one member, by phone (E.164) or contact id. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; member: string }> }) {
  const { id, member } = await params;
  return groupsHandler(request, (db, userId) => removeMember(db, userId, decodeURIComponent(id), decodeURIComponent(member)));
}
