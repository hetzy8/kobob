import { SignInForm } from "@/components/sign-in-form";
import { copy } from "@/locales/he";
export default function SignIn() {
	return (
		<section className="panel">
			<h1>{copy.signIn}</h1>
			<SignInForm />
		</section>
	);
}
