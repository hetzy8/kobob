import "server-only";
import { readStorageConfig } from "../lib/config";
import { database } from "../lib/runtime";
import { createR2Storage, type ObjectStorage } from "../lib/storage";
import { requireMember } from "./access";
import { createMediaReader } from "./media";

let storage: ObjectStorage | undefined;
let reader: ReturnType<typeof createMediaReader> | undefined;
export function mediaReader() {
	reader ??= createMediaReader(database(), requireMember, () => {
		storage ??= createR2Storage(readStorageConfig(process.env));
		return storage;
	});
	return reader;
}
