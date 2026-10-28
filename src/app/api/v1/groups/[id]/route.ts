import { groupsHandler } from "@/lib/groups-route";
import { deleteGroup, getGroup, updateGroup } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

/** One group with its members. `id` is the group id or its external_ref. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  return groupsHandler(request, (db, userId) => getGroup(db, userId, decodeURIComponent(id)));
}

/** Change name, description, from, relay; `members` (when given) replaces the member list. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return groupsHandler(request, (db, userId, body) => updateGroup(db, userId, decodeURIComponent(id), body));
}

export const PUT = PATCH;

export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  return groupsHandler(request, (db, userId) => deleteGroup(db, userId, decodeURIComponent(id)));
}
