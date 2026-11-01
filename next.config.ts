import type { NextConfig } from "next";
const config: NextConfig = {
	poweredByHeader: false,
	distDir: process.env.KOBOB_E2E === "1" ? ".next-e2e" : ".next",
	logging: { incomingRequests: false },
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "Cache-Control", value: "private, no-store" },
					{ key: "Referrer-Policy", value: "no-referrer" },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "X-Frame-Options", value: "DENY" },
				],
			},
		];
	},
};
export default config;
