import { JWT } from "google-auth-library";

export type DriveClient = {
	readHead(id: string): Promise<Uint8Array>;
	readStream(id: string): Promise<ReadableStream<Uint8Array>>;
};

const HEAD_BYTES = 16;

// Read-only scope. The service account sees only the folder shared with it.
export function createDriveClient(keyFilePath: string): DriveClient {
	const auth = new JWT({ keyFile: keyFilePath, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
	async function get(id: string, range?: string) {
		const { token } = await auth.getAccessToken();
		const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
			headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) },
		});
		if (!response.ok || !response.body) throw new Error(`DRIVE_READ_FAILED_${response.status}`);
		return response;
	}
	return {
		readHead: async (id) => new Uint8Array(await (await get(id, `bytes=0-${HEAD_BYTES - 1}`)).arrayBuffer()),
		readStream: async (id) => (await get(id)).body as ReadableStream<Uint8Array>,
	};
}
