import { describe, expect, it } from "vitest";
import { failureCodes } from "../../src/lib/failure-codes";

describe("failureCodes", () => {
	it("keeps codes along the cause chain", () => {
		const root = Object.assign(new Error("relation does not exist"), {
			code: "42P01",
		});
		const wrapped = Object.assign(new Error("query failed", { cause: root }), {
			name: "PrismaClientKnownRequestError",
			code: "P2010",
			meta: { code: "42P01" },
		});
		expect(failureCodes(wrapped)).toEqual([
			"name=PrismaClientKnownRequestError",
			"code=P2010",
			"meta.code=42P01",
			"name=Error",
			"code=42P01",
		]);
	});

	it("never includes messages or values that look like connection details", () => {
		const secret = "postgresql://user:pass@host.example/db";
		const error = Object.assign(new Error(secret), {
			code: secret,
			kind: "has spaces and : colons",
		});
		const codes = failureCodes(error);
		expect(codes.join(" ")).not.toContain("pass");
		expect(codes).toEqual(["name=Error"]);
	});

	it("drops dotted or hyphenated values such as hostnames", () => {
		const error = Object.assign(new Error("x"), {
			code: "ep-host-pooler.eu-central-1.aws.neon.tech",
			kind: "db.example.org",
		});
		expect(failureCodes(error)).toEqual(["name=Error"]);
	});

	it("reads Prisma driver adapter details from meta", () => {
		const error = Object.assign(new Error("x"), {
			name: "PrismaClientKnownRequestError",
			code: "P2010",
			meta: {
				driverAdapterError: Object.assign(new Error("y"), {
					name: "DriverAdapterError",
					cause: { kind: "DatabaseDoesNotExist", originalCode: "3D000" },
				}),
			},
		});
		expect(failureCodes(error)).toEqual([
			"name=PrismaClientKnownRequestError",
			"code=P2010",
			"name=DriverAdapterError",
			"kind=DatabaseDoesNotExist",
			"originalCode=3D000",
		]);
	});

	it("tolerates non-errors", () => {
		expect(failureCodes("boom")).toEqual([]);
		expect(failureCodes(null)).toEqual([]);
	});
});
