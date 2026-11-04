import "server-only";
import { database } from "../lib/runtime";
import { requireMember } from "./access";
import { createArchiveReader } from "./archive";
import { createEditorialService } from "./editorial";

let editorial: ReturnType<typeof createEditorialService> | undefined;
let archive: ReturnType<typeof createArchiveReader> | undefined;
// One shared database client per server instance (see runtime.ts).
export function editorialService() {
	editorial ??= createEditorialService(database(), requireMember);
	return editorial;
}
export function archiveReader() {
	archive ??= createArchiveReader(database());
	return archive;
}
