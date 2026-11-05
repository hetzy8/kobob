import "server-only";
import { isLocalHttpOrigin, readEmailConfig } from "./config";

type Message = { email: string; url: string };
type Deliver = (message: Message) => Promise<void>;
// Local development may opt in to live mail. `next dev` also serves the browser
// tests and loads the developer's local env file, so the setting alone is not
// enough: browser tests and any non-local origin stay off.
function developmentOptIn(env: Record<string, string | undefined>) {
	return (
		env.NODE_ENV === "development" &&
		env.EMAIL_IN_DEVELOPMENT === "1" &&
		env.KOBOB_E2E !== "1" &&
		isLocalHttpOrigin(env.SITE_ORIGIN)
	);
}
// Chooses how sign-in links are delivered. Live mail in production, or in local
// development with the explicit opt-in, and only with valid settings; otherwise
// the provider client is never built. Delivery is scheduled after the response (`schedule`, which is Next's
// `after` in the app) so a member's request takes as long as a non-member's:
// response time must not reveal membership. A failed or timed-out delivery is
// logged by the sender as codes; the unused link then simply expires (15 min).
export function createLinkSender({
	env,
	schedule,
	makeSender,
}: {
	env: Record<string, string | undefined>;
	schedule: (task: () => Promise<void>) => void;
	makeSender: (config: { apiKey: string; from: string }) => Deliver;
}): Deliver {
	if (env.NODE_ENV === "production" || developmentOptIn(env)) {
		try {
			const deliver = makeSender(readEmailConfig(env));
			return async (message) => {
				schedule(async () => {
					try {
						await deliver(message);
					} catch {
						console.error("[email] sign-in link not delivered");
					}
				});
			};
		} catch {
			console.error("[email] delivery not configured");
		}
	}
	return async () => {
		throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
	};
}
