"use client";
import { useActionState, useState } from "react";
import { savePlaceForm, type ItemFormState } from "@/app/family/items/actions";
import type { PlaceRecord } from "@/services/editorial";
import { copy } from "@/locales/he";

export function PlaceForm({ place }: { place?: PlaceRecord }) {
	const [state, submit, pending] = useActionState(savePlaceForm, { status: "idle" } as ItemFormState);
	const version = Math.max(place?.version ?? 0, state.version ?? 0);
	const [name, setName] = useState(place?.name ?? "");
	const [otherNames, setOtherNames] = useState(place?.otherNames.join(", ") ?? "");
	const [latitude, setLatitude] = useState(place?.latitude?.toString() ?? "");
	const [longitude, setLongitude] = useState(place?.longitude?.toString() ?? "");
	const [handled, setHandled] = useState(state);
	if (!place && state.status === "saved" && handled !== state) {
		setHandled(state);
		setName("");
		setOtherNames("");
		setLatitude("");
		setLongitude("");
	}
	return (
		<form action={submit}>
			{place && <input type="hidden" name="id" value={place.id} />}
			{place && <input type="hidden" name="version" value={version} />}
			<label>
				{copy.items.name}
				<input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
			</label>
			<label>
				{copy.items.otherNames}
				<input name="otherNames" value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
			</label>
			<label>
				{copy.items.latitude}
				<input name="latitude" inputMode="decimal" dir="ltr" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
			</label>
			<label>
				{copy.items.longitude}
				<input name="longitude" inputMode="decimal" dir="ltr" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
			</label>
			<button type="submit" disabled={pending}>
				{place ? copy.items.save : copy.items.addNew}
			</button>
			<p role="status">
				{state.status === "saved" && copy.items.saved}
				{state.status === "invalid" && copy.items.invalid}
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
		</form>
	);
}
