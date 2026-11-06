import { GoogleAuth, Impersonated } from "google-auth-library";

export type DriveClient = {
	readHead(id: string): Promise<Uint8Array>;
	readStream(id: string): Promise<ReadableStream<Uint8Array>>;
};

const HEAD_BYTES = 16;

// Read-only scope. The service account sees only the folder shared with it.
// The operator's gcloud login acts as that service account, with no key file:
//   gcloud auth application-default login --impersonate-service-account=<email>
// Any other login is refused, since a personal one could read the whole Drive.
export async function createDriveClient(): Promise<DriveClient> {
	const auth = await new GoogleAuth({
		scopes: ["https://www.googleapis.com/auth/drive.readonly"],
	}).getClient();
	if (!(auth instanceof Impersonated)) throw new Error("DRIVE_LOGIN_NOT_IMPERSONATED");
	async function get(id: string, range?: string) {
		const { token } = await auth.getAccessToken();
		const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
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
