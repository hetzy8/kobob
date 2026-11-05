const APPLE_DOUBLE = [0x00, 0x05, 0x16, 0x07];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];
// Office lock files are a few hundred bytes and open with the length of the owner's name.
const LOCK_FILE_MAX_BYTES = 512n;
const MAX_OWNER_NAME_BYTES = 54;

const startsWith = (head: Uint8Array, magic: number[]) =>
	magic.every((byte, index) => head[index] === byte);

export function isSystemFileName(name: string): boolean {
	const lower = name.toLowerCase();
	return (name.startsWith("._") && name.length > 2) || lower === "thumbs.db" || name.startsWith("~$");
}

// A name alone is not proof: anything unconfirmed stays an item.
export function confirmSystemFile(name: string, sizeBytes: bigint, head: Uint8Array): boolean {
	if (name.startsWith("._")) return startsWith(head, APPLE_DOUBLE);
	if (name.toLowerCase() === "thumbs.db") return startsWith(head, OLE);
	if (name.startsWith("~$")) {
		const ownerLength = head[0];
		return sizeBytes <= LOCK_FILE_MAX_BYTES && ownerLength !== undefined && ownerLength >= 1 && ownerLength <= MAX_OWNER_NAME_BYTES;
	}
	return false;
}
