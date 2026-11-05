import { expect, it } from "vitest";
import { isSafeSourceUrl } from "../../src/lib/source-url";

it.each(["https://example.test/a", "http://example.test/%D7%90"])("accepts %s", (url) => {
	expect(isSafeSourceUrl(url)).toBe(true);
});
it.each(["javascript:alert(1)", "data:text/html,x", "file:///a", "ftp://example.test", "", "not a url", "https://user:pass@example.test"])(
	"rejects %s",
	(url) => {
		expect(isSafeSourceUrl(url)).toBe(false);
	},
);
