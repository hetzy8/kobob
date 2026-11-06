import { createHash } from "node:crypto";
import type { Database } from "../lib/database";
import type { ObjectStorage } from "../lib/storage";
import { catalog as c } from "./catalog-columns";
import type { CatalogRow } from "./catalog-plan";
import { type Derived, makeDisplayCopy, makeThumbnail } from "./derive";
import type { DriveClient } from "./drive";
import {
	needsDisplayCopy,
	needsThumbnail,
	verifiedMimeType,
} from "./file-formats";

export type CopyReport = {
	considered: number;
	verified: number;
	copied: { kobId: string; fileId: string }[];
	failed: { kobId: string; code: string }[];
	derivativesFailed: { kobId: string; code: string }[];
	// Verified originals from earlier runs with a thumbnail or display copy missing.
	derivativesConsidered: number;
	derivativesRepaired: number;
	// Named with `only` but with no unverified original: already copied, or unknown.
	notPending: string[];
	bytes: bigint;
};

class CopyError extends Error {}

async function readAll(stream: ReadableStream<Uint8Array>) {
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");

async function writeDerived(
	db: Database,
	storage: ObjectStorage,
	itemId: string,
	role: "thumbnail" | "display",
	filename: string,
	derived: Derived,
) {
	const storageKey = `${role}s/${itemId}.jpg`;
	await storage.write(storageKey, derived.bytes, derived.mimeType);
	const data = {
		storageKey,
		mimeType: derived.mimeType,
		sizeBytes: BigInt(derived.bytes.length),
		sha256: sha256(derived.bytes),
		width: derived.width,
		height: derived.height,
		status: "verified" as const,
		originalFilename: filename,
	};
	await db.mediaFile.upsert({
		where: { itemId_role: { itemId, role } },
		create: { itemId, role, ...data },
		update: data,
	});
}

const expectedDerivatives = (mimeType: string) => [
	...(needsThumbnail(mimeType) ? (["thumbnail"] as const) : []),
	...(needsDisplayCopy(mimeType) ? (["display"] as const) : []),
];

export async function copyMedia(
	db: Database,
	drive: DriveClient,
	storage: ObjectStorage,
	{ apply, limit, only }: { apply: boolean; limit?: number; only?: string[] },
): Promise<CopyReport> {
	const named = only ? { item: { kobId: { in: only } } } : {};
	const pendingWhere = {
		role: "original" as const,
		status: { not: "verified" as const },
		...named,
	};
	const files = await db.mediaFile.findMany({
		where: pendingWhere,
		include: {
			item: {
				select: { kobId: true, catalogRecord: { select: { row: true } } },
			},
		},
		orderBy: { sizeBytes: "asc" },
		...(limit ? { take: limit } : {}),
	});
	// Read apart from `files`, so a file the limit left out still counts as pending.
	const pending = only
		? await db.mediaFile.findMany({
				where: pendingWhere,
				select: { item: { select: { kobId: true } } },
			})
		: [];
	const pendingIds = new Set(pending.map((file) => file.item.kobId));
	// Listed before copying: files verified by this run derive in its own loop.
	const verified = await db.mediaFile.findMany({
		where: { role: "original", status: "verified", ...named },
		include: {
			item: {
				select: {
					kobId: true,
					files: {
						where: { status: "verified" },
						select: { role: true },
					},
				},
			},
		},
		orderBy: { sizeBytes: "asc" },
	});
	const repairs = verified
		.map((file) => {
			const present = new Set(file.item.files.map(({ role }) => role));
			return {
				file,
				missing: expectedDerivatives(file.mimeType).filter(
					(role) => !present.has(role),
				),
			};
		})
		.filter(({ missing }) => missing.length > 0)
		.slice(0, limit);
	const report: CopyReport = {
		considered: files.length,
		verified: 0,
		copied: [],
		failed: [],
		derivativesFailed: [],
		derivativesConsidered: repairs.length,
		derivativesRepaired: 0,
		notPending: (only ?? []).filter((kobId) => !pendingIds.has(kobId)),
		bytes: 0n,
	};
	if (!apply) return report;
	const startedAt = new Date();
	for (const file of files) {
		const kobId = file.item.kobId ?? file.itemId;
		try {
			const row = file.item.catalogRecord?.row as {
				catalog?: CatalogRow;
			} | null;
			const driveId = row?.catalog?.[c.driveId];
			if (!driveId) throw new CopyError("MISSING_DRIVE_ID");
			let bytes: Uint8Array;
			try {
				bytes = await readAll(await drive.readStream(driveId));
			} catch {
				throw new CopyError("DRIVE_READ_FAILED");
			}
			if (BigInt(bytes.length) !== file.sizeBytes)
				throw new CopyError("SIZE_MISMATCH");
			const hash = sha256(bytes);
			if (file.sha256 && file.sha256.toLowerCase() !== hash)
				throw new CopyError("HASH_MISMATCH");
			const mimeType = verifiedMimeType(file.mimeType, bytes.subarray(0, 16));
			try {
				await storage.write(file.storageKey, bytes, mimeType);
			} catch {
				throw new CopyError("STORAGE_WRITE_FAILED");
			}
			let stored: Uint8Array;
			try {
				stored = await readAll(await storage.read(file.storageKey));
			} catch {
				throw new CopyError("STORAGE_READ_FAILED");
			}
			if (stored.length !== bytes.length || sha256(stored) !== hash)
				throw new CopyError("VERIFY_MISMATCH");
			await db.mediaFile.update({
				where: { id: file.id },
				data: { status: "verified", failureCode: null, sha256: hash, mimeType },
			});
			report.verified++;
			report.copied.push({ kobId, fileId: file.id });
			report.bytes += file.sizeBytes;
			try {
				if (needsThumbnail(mimeType))
					await writeDerived(
						db,
						storage,
						file.itemId,
						"thumbnail",
						file.originalFilename,
						await makeThumbnail(stored),
					);
				if (needsDisplayCopy(mimeType))
					await writeDerived(
						db,
						storage,
						file.itemId,
						"display",
						file.originalFilename,
						await makeDisplayCopy(stored),
					);
			} catch {
				report.derivativesFailed.push({ kobId, code: "DERIVATIVE_FAILED" });
			}
		} catch (error) {
			const code = error instanceof CopyError ? error.message : "COPY_FAILED";
			report.failed.push({ kobId, code });
			await db.mediaFile.update({
				where: { id: file.id },
				data: { status: "failed", failureCode: code },
			});
		}
	}
	for (const { file, missing } of repairs) {
		const kobId = file.item.kobId ?? file.itemId;
		try {
			const stored = await readAll(await storage.read(file.storageKey));
			if (!file.sha256 || sha256(stored) !== file.sha256)
				throw new CopyError("STORED_ORIGINAL_MISMATCH");
			for (const role of missing)
				await writeDerived(
					db,
					storage,
					file.itemId,
					role,
					file.originalFilename,
					await (role === "thumbnail"
						? makeThumbnail(stored)
						: makeDisplayCopy(stored)),
				);
			report.derivativesRepaired++;
		} catch (error) {
			const code =
				error instanceof CopyError ? error.message : "DERIVATIVE_FAILED";
			report.derivativesFailed.push({ kobId, code });
		}
	}
	await db.importRun.create({
		data: {
			kind: "media",
			snapshotHash: "",
			startedAt,
			finishedAt: new Date(),
			counts: {
				considered: report.considered,
				verified: report.verified,
				failed: report.failed.length,
				derivativesFailed: report.derivativesFailed.length,
				derivativesRepaired: report.derivativesRepaired,
				bytes: String(report.bytes),
			},
		},
	});
	return report;
}
