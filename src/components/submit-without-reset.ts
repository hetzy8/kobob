import { type FormEvent, startTransition } from "react";

// React resets a form after an `action={…}` submission. A reset returns a
// controlled checkbox to its page-load state in the DOM while React state
// keeps the new value, so the next save would silently send the old value
// (for family-only, that makes a person public again). Submitting through
// onSubmit dispatches the same action without the reset; `pending` from
// useActionState still works because the dispatch runs in a transition.
export function submitWithoutReset(submit: (data: FormData) => void) {
	return (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		startTransition(() => submit(data));
	};
}
