import { expect, it } from "vitest";
import { catalog as c, web as w } from "../../src/import/catalog-columns";
import { planCatalog } from "../../src/import/catalog-plan";

const family = (id: string, extra = {}) => ({
	[c.id]: id, [c.originalName]: "synthetic.jpg", [c.type]: "קובץ תמונה", [c.sourceKind]: "Drive",
	[c.driveId]: `drive-${id}`, [c.mime]: "image/jpeg", [c.size]: "1.5519895E7", [c.sha256]: "",
	[c.rights]: "לא ידוע", [c.reviewedDescription]: "PRIVATE-NOTE", ...extra,
});
const webCatalog = (id: string, extra = {}) => ({
	[c.id]: id, [c.originalName]: "page", [c.type]: "דף אינטרנט", [c.sourceKind]: "אינטרנט",
	[c.driveId]: "", [c.mime]: "text/html", [c.size]: "", [c.sha256]: "", [c.rights]: "לא ידוע", ...extra,
});
const webRow = (id: string, extra = {}) => ({
	[w.id]: id, [w.type]: "כתבה", [w.title]: "Synthetic title", [w.publisher]: "Press", [w.author]: "Writer",
	[w.publishedText]: "1979", [w.url]: "https://example.test/a", [w.identityBasis]: "שם מפורש והקשר ביוגרפי",
	[w.saved]: "קישור ותקציר בלבד", [w.licenseSource]: "", ...extra,
});

it("plans a private family record titled by its filename", () => {
	const { records, errors } = planCatalog([family("KOB-000001")], []);
	expect(errors).toEqual([]);
	expect(records[0]).toMatchObject({
		kobId: "KOB-000001", origin: "family", title: "synthetic.jpg", types: ["picture"], publish: false,
		source: null, systemCandidate: false, rightsStatus: "unknown",
	});
	expect(records[0].file?.sizeBytes).toBe(15519895n);
});

it("publishes an explicitly identified internet record as a link card", () => {
	const { records } = planCatalog([webCatalog("KOB-000002")], [webRow("KOB-000002")]);
	expect(records[0]).toMatchObject({
		origin: "internet", title: "Synthetic title", types: ["article"], publish: true,
		source: { url: "https://example.test/a", publisher: "Press", author: "Writer", publishedText: "1979", license: "" },
		file: null,
	});
});

it("holds a search-match internet record private", () => {
	const { records } = planCatalog(
		[webCatalog("KOB-000003")],
		[webRow("KOB-000003", { [w.identityBasis]: "התאמת שם והקשר מתוצאת חיפוש" })],
	);
	expect(records[0].publish).toBe(false);
});

it("keeps a saved internet copy as a file while still publishing the card", () => {
	const { records } = planCatalog(
		[webCatalog("KOB-000004", { [c.driveId]: "drive-4", [c.mime]: "image/jpeg", [c.size]: "10" })],
		[webRow("KOB-000004", { [w.saved]: "קובץ מקורי נשמר" })],
	);
	expect(records[0].publish).toBe(true);
	expect(records[0].file?.driveFileId).toBe("drive-4");
});

it("marks system-file candidates without deciding them", () => {
	const { records } = planCatalog([family("KOB-000005", { [c.originalName]: "._a.jpg" })], []);
	expect(records[0].systemCandidate).toBe(true);
});

it("never auto-clears rights, even with a documented license", () => {
	const { records } = planCatalog(
		[webCatalog("KOB-000006", { [c.rights]: "אישור מתועד — CC BY-SA 3.0" })],
		[webRow("KOB-000006")],
	);
	expect(records[0].rightsStatus).toBe("unknown");
	const { records: other } = planCatalog([family("KOB-000007", { [c.rights]: "נדרש בירור" })], []);
	expect(other[0].rightsStatus).toBe("needs_clarification");
});

it("reports invalid rows and continues", () => {
	const { records, errors } = planCatalog(
		[
			family("KOB-000008"), family("KOB-000008"), family("BAD"),
			family("KOB-000009", { [c.size]: "abc" }), family("KOB-000010", { [c.driveId]: "" }),
			family("KOB-000011", { [c.type]: "unmapped" }), family("KOB-000012", { [c.originalName]: "x".repeat(201) }),
			webCatalog("KOB-000013"), webCatalog("KOB-000014"),
		],
		[webRow("KOB-000014", { [w.url]: "javascript:alert(1)" })],
	);
	expect(records.map((record) => record.kobId)).toEqual(["KOB-000008"]);
	expect(errors).toEqual([
		{ kobId: "KOB-000008", code: "DUPLICATE_ID" },
		{ kobId: "BAD", code: "INVALID_ID" },
		{ kobId: "KOB-000009", code: "INVALID_SIZE" },
		{ kobId: "KOB-000010", code: "MISSING_DRIVE_ID" },
		{ kobId: "KOB-000011", code: "UNKNOWN_TYPE" },
		{ kobId: "KOB-000012", code: "TITLE_TOO_LONG" },
		{ kobId: "KOB-000013", code: "MISSING_WEB_ROW" },
		{ kobId: "KOB-000014", code: "UNSAFE_URL" },
	]);
});
