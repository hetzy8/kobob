"use client";
import { useActionState, useEffect, useState } from "react";
import { savePlaceForm, type ItemFormState } from "@/app/family/items/actions";
import type { PlaceRecord } from "@/services/editorial";
import { copy } from "@/locales/he";
import { useClientReady } from "./use-client-ready";

export function PlaceForm({ place }: { place?: PlaceRecord }) {
	const [state, submit, pending] = useActionState(savePlaceForm, { status: "idle" } as ItemFormState);
	const ready = useClientReady();
	const latest = state.status === "conflict" ? state.latestPlace : undefined;
	const version = Math.max(place?.version ?? 0, state.version ?? 0, latest?.version ?? 0);
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
	// An effect so it runs after React's post-action form reset.
	useEffect(() => {
		if (latest) {
			setLatitude(latest.latitude?.toString() ?? "");
			setLongitude(latest.longitude?.toString() ?? "");
		}
	}, [latest]);
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
			<button type="submit" disabled={!ready || pending}>
				{place ? copy.items.save : copy.items.addNew}
			</button>
			<p role="status">
				{state.status === "saved" && copy.items.saved}
				{state.status === "invalid" && copy.items.invalid}
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
			{latest && (
				<aside aria-label={copy.items.latest}>
					<h2>{copy.items.latest}</h2>
					<p>{latest.name}</p>
					<p>{latest.otherNames.join(", ")}</p>
					{latest.latitude !== null && latest.longitude !== null && (
						<p dir="ltr">
							{latest.latitude}, {latest.longitude}
						</p>
					)}
				</aside>
			)}
		</form>
	);
}
