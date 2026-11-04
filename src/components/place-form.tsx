"use client";
import { useActionState, useState } from "react";
import { savePlaceForm, type ItemFormState } from "@/app/family/items/actions";
import type { PlaceRecord } from "@/services/editorial";
import { copy } from "@/locales/he";
import { submitWithoutReset } from "./submit-without-reset";
import { useClientReady } from "./use-client-ready";
import { listOf, type Snapshot, useFormBase } from "./use-form-base";

type Content = {
	name: string;
	otherNames: string[];
	latitude: number | string | null;
	longitude: number | string | null;
};
// Text that is not a number stays text, so it never compares equal to a
// stored coordinate (or to none).
const coordinate = (value: string) => {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const parsed = Number(trimmed);
	return Number.isNaN(parsed) ? trimmed : parsed;
};
const content = (name: string, otherNames: string, latitude: string, longitude: string): Content => ({
	name: name.trim(),
	otherNames: listOf(otherNames),
	latitude: coordinate(latitude),
	longitude: coordinate(longitude),
});
const snapshot = (place?: PlaceRecord): Snapshot<Content> | undefined =>
	place && {
		version: place.version,
		content: content(
			place.name,
			place.otherNames.join(", "),
			place.latitude?.toString() ?? "",
			place.longitude?.toString() ?? "",
		),
	};

export function PlaceForm({ place }: { place?: PlaceRecord }) {
	const [state, submit, pending] = useActionState(savePlaceForm, { status: "idle" } as ItemFormState);
	const ready = useClientReady();
	const latest = state.status === "conflict" ? state.latestPlace : undefined;
	const [name, setName] = useState(place?.name ?? "");
	const [otherNames, setOtherNames] = useState(place?.otherNames.join(", ") ?? "");
	const [latitude, setLatitude] = useState(place?.latitude?.toString() ?? "");
	const [longitude, setLongitude] = useState(place?.longitude?.toString() ?? "");
	const { version, remember } = useFormBase({
		loaded: snapshot(place),
		current: content(name, otherNames, latitude, longitude),
		state,
		latest: snapshot(latest),
		load: (loaded) => {
			setName(loaded.name);
			setOtherNames(loaded.otherNames.join(", "));
			setLatitude(loaded.latitude?.toString() ?? "");
			setLongitude(loaded.longitude?.toString() ?? "");
		},
	});
	const [handled, setHandled] = useState(state);
	if (handled !== state) {
		setHandled(state);
		if (!place && state.status === "saved") {
			setName("");
			setOtherNames("");
			setLatitude("");
			setLongitude("");
		}
		if (latest) {
			setLatitude(latest.latitude?.toString() ?? "");
			setLongitude(latest.longitude?.toString() ?? "");
		}
	}
	return (
		<form
			onSubmit={submitWithoutReset((data) => {
				remember();
				submit(data);
			})}
		>
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
