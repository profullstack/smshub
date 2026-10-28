import { groupsHandler } from "@/lib/groups-route";
import { listGroups, saveGroup } from "@/lib/groups";

/** Your contact groups. */
export async function GET(request: Request) {
  return groupsHandler(request, async (db, userId) => ({ groups: await listGroups(db, userId) }));
}

/**
 * Make a group: { name, description?, from?, relay?, members?: [{ phone, name? }], external_ref? }.
 * With external_ref already on one of your groups, that group is updated and its members replaced.
 */
export async function POST(request: Request) {
  return groupsHandler(request, (db, userId, body) => saveGroup(db, userId, body), 201);
}
