import { expect, it } from "vitest";
import { clientAddressFrom } from "../../src/lib/client-address";

const from = (value?: string) =>
	clientAddressFrom(
		new Request("https://valid.example/", {
			headers: value ? { "x-vercel-forwarded-for": value } : {},
		}),
	);

it("reads an IPv4 address", () => {
	expect(from("203.0.113.9")).toBe("203.0.113.9");
});
it("takes the first address in a list", () => {
	expect(from("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
});
it("reduces IPv6 to its /64, however it is written", () => {
	const expected = "2001:db8:1:2::/64";
	expect(from("2001:db8:1:2:3:4:5:6")).toBe(expected);
	expect(from("2001:db8:1:2::9")).toBe(expected);
	expect(from("2001:0DB8:0001:0002::9")).toBe(expected);
	expect(from("2001:db8::1")).toBe("2001:db8:0:0::/64");
	expect(from("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
});
it("treats an IPv4-mapped address as IPv4", () => {
	expect(from("::ffff:203.0.113.9")).toBe("203.0.113.9");
});
it.each([undefined, "", "not-an-address", "999.1.1.1"])(
	"returns nothing for %s",
	(value) => {
		expect(from(value)).toBe("");
	},
);
it("ignores x-forwarded-for", () => {
	const request = new Request("https://valid.example/", {
		headers: { "x-forwarded-for": "203.0.113.9" },
	});
	expect(clientAddressFrom(request)).toBe("");
});
