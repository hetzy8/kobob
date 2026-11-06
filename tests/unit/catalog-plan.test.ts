import { expect, it } from "vitest";
import { catalog as c, web as w } from "../../src/import/catalog-columns";
import { planCatalog, reviewLists } from "../../src/import/catalog-plan";

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

it("reports duplicate and orphan web rows without planning the duplicated record", () => {
	const { records, errors } = planCatalog(
		[webCatalog("KOB-000020"), webCatalog("KOB-000021"), family("KOB-000022")],
		[webRow("KOB-000020"), webRow("KOB-000020"), webRow("KOB-000021"), webRow("KOB-000099")],
	);
	expect(records.map((record) => record.kobId)).toEqual(["KOB-000021", "KOB-000022"]);
	expect(errors).toEqual([
		{ kobId: "KOB-000020", code: "DUPLICATE_WEB_ROW" },
		{ kobId: "KOB-000099", code: "ORPHAN_WEB_ROW" },
	]);
});

it("reads sizes with thousands separators, as Sheets exports them", () => {
	const size = (value: string) =>
		planCatalog([family("KOB-000033", { [c.size]: value })], []).records[0]?.file?.sizeBytes;
	expect(size("1,234,567")).toBe(1234567n);
	expect(size("15,519")).toBe(15519n);
	const code = (value: string) => planCatalog([family("KOB-000033", { [c.size]: value })], []).errors[0]?.code;
	for (const bad of ["1,23", "1,2345", ",123", "123,", "1,,234", "1234,567", "1,234.5", "1,234e3"]) {
		expect(code(bad), bad).toBe("INVALID_SIZE");
	}
});

it("accepts only plain decimal or exponent sizes", () => {
	const code = (size: string) => planCatalog([family("KOB-000030", { [c.size]: size })], []).errors[0]?.code;
	expect(code("0x10")).toBe("INVALID_SIZE");
	expect(code(" 10")).toBe("INVALID_SIZE");
	expect(code("10 ")).toBe("INVALID_SIZE");
	expect(code("")).toBe("INVALID_SIZE");
	expect(code("1.5e+3")).toBeUndefined();
	expect(code("10")).toBeUndefined();
});

it("defaults an empty MIME type and rejects a missing title", () => {
	const { records } = planCatalog([family("KOB-000031", { [c.mime]: "" })], []);
	expect(records[0].file?.mimeType).toBe("application/octet-stream");
	const { errors } = planCatalog([webCatalog("KOB-000032")], [webRow("KOB-000032", { [w.title]: "  " })]);
	expect(errors).toEqual([{ kobId: "KOB-000032", code: "MISSING_TITLE" }]);
});

it("never publishes a link to a private Drive or Docs host", () => {
	const url = (value: string) =>
		planCatalog([webCatalog("KOB-000033")], [webRow("KOB-000033", { [w.url]: value })]).errors[0]?.code;
	expect(url("https://drive.google.com/file/d/synthetic/view")).toBe("PRIVATE_SOURCE_HOST");
	expect(url("https://docs.google.com/document/d/synthetic")).toBe("PRIVATE_SOURCE_HOST");
	expect(url("https://example.test/a")).toBeUndefined();
});

it("treats a trailing dot, mixed case and Google content hosts as private", () => {
	const url = (value: string) =>
		planCatalog([webCatalog("KOB-000034")], [webRow("KOB-000034", { [w.url]: value })]).errors[0]?.code;
	expect(url("https://Drive.Google.com./file/d/synthetic/view")).toBe("PRIVATE_SOURCE_HOST");
	expect(url("https://drive.usercontent.google.com/download?id=synthetic")).toBe("PRIVATE_SOURCE_HOST");
	expect(url("https://lh3.googleusercontent.com/synthetic")).toBe("PRIVATE_SOURCE_HOST");
	expect(url("https://example.googleusercontent.com./synthetic")).toBe("PRIVATE_SOURCE_HOST");
	expect(url("https://notgoogleusercontent.com/a")).toBeUndefined();
});

it("lists cataloged dates and site selections for review, skipping blanks", () => {
	const { records } = planCatalog(
		[
			family("KOB-000040", { [c.eventDate]: "1979", [c.siteSelection]: "כן" }),
			family("KOB-000041", { [c.eventDate]: " ", [c.siteSelection]: "" }),
			webCatalog("KOB-000042", { [c.siteSelection]: "כן" }),
		],
		[webRow("KOB-000042")],
	);
	expect(reviewLists(records)).toEqual({
		catalogedDates: [{ kobId: "KOB-000040", value: "1979" }],
		siteSelected: [
			{ kobId: "KOB-000040", publish: false },
			{ kobId: "KOB-000042", publish: true },
		],
	});
});
