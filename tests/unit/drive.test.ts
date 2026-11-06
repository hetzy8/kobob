import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Impersonated } from "google-auth-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDriveClient } from "../../src/import/drive";

// Synthetic credentials: nothing here can reach Google.
const userLogin = {
	type: "authorized_user",
	client_id: "synthetic-client",
	client_secret: "synthetic-secret",
	refresh_token: "synthetic-refresh",
};
const impersonatedLogin = {
	type: "impersonated_service_account",
	source_credentials: userLogin,
	service_account_impersonation_url:
		"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/reader@synthetic.iam.gserviceaccount.com:generateAccessToken",
};

describe("createDriveClient", () => {
	let directory: string;
	const loginWith = (login: object) => {
		const path = join(directory, "login.json");
		writeFileSync(path, JSON.stringify(login));
		vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", path);
	};

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "kobob-drive-"));
		// Without this the library looks up a project through gcloud and the network.
		vi.stubEnv("GOOGLE_CLOUD_PROJECT", "synthetic-project");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		rmSync(directory, { recursive: true, force: true });
	});

	it("refuses a personal login, which could read the whole Drive", async () => {
		loginWith(userLogin);
		await expect(createDriveClient()).rejects.toThrow("DRIVE_LOGIN_NOT_IMPERSONATED");
	});

	it("reads with the service account's token and asks only for read-only access", async () => {
		loginWith(impersonatedLogin);
		const seenScopes: unknown[] = [];
		vi.spyOn(Impersonated.prototype, "getAccessToken").mockImplementation(async function (
			this: Impersonated,
		) {
			seenScopes.push((this as unknown as { targetScopes: string[] }).targetScopes);
			return { token: "synthetic-token" };
		});
		const fetchMock = vi.fn(
			async (_url: string, _init: RequestInit) => new Response(new Uint8Array([1, 2, 3])),
		);
		vi.stubGlobal("fetch", fetchMock);

		const drive = await createDriveClient();
		const head = await drive.readHead("file/1");

		expect([...head]).toEqual([1, 2, 3]);
		expect(seenScopes).toEqual([["https://www.googleapis.com/auth/drive.readonly"]]);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(
			"https://www.googleapis.com/drive/v3/files/file%2F1?alt=media&supportsAllDrives=true",
		);
		expect(init.headers).toEqual({ authorization: "Bearer synthetic-token", range: "bytes=0-15" });
	});
});
