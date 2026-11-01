import { ConfirmSignIn } from "@/components/confirm-sign-in";
import { copy } from "@/locales/he";
export default function Verify() {
	return (
		<section className="panel">
			<h1>{copy.confirm}</h1>
			<ConfirmSignIn />
		</section>
	);
}
