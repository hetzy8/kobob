"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { editorialService } from "@/services/editorial-runtime";
import type { EditorialAction, FamilyItem } from "@/services/editorial";
import type { ItemInput } from "@/services/item-input";

export type ItemFormState = {
	status: "idle" | "saved" | "invalid" | "conflict" | "failed";
	version?: number;
	fields?: string[];
	latest?: FamilyItem;
};

const isAccessError = (error: unknown) =>
	error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message);
const list = (value: FormDataEntryValue | null) =>
	String(value ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
const actions: readonly string[] = ["publish", "make-private", "archive", "restore"];

function readItem(data: FormData): ItemInput {
	const kind = String(data.get("dateKind") ?? "unknown");
	const precision = String(data.get("datePrecision") ?? "year");
	const approximate = data.get("dateApproximate") === "on";
	const start = String(data.get("dateStart") ?? "");
	const date =
		kind === "single"
			? { kind, start, precision, approximate }
			: kind === "range"
				? { kind, start, end: String(data.get("dateEnd") ?? ""), precision, approximate }
				: { kind: "unknown" };
	return {
		title: String(data.get("title") ?? ""),
		description: String(data.get("description") ?? ""),
		types: data.getAll("types").map(String),
		date,
		tags: list(data.get("tags")),
		personIds: data.getAll("personIds").map(String),
		placeIds: data.getAll("placeIds").map(String),
	} as ItemInput;
}

export async function saveItem(
	_previous: ItemFormState,
	data: FormData,
): Promise<ItemFormState> {
	const id = String(data.get("id") ?? "");
	const expected = Number(data.get("version"));
	let createdId: string | undefined;
	try {
		const service = editorialService();
		if (!id) createdId = (await service.createItem(readItem(data))).id;
		else {
			const { version } = await service.updateItem(id, expected, readItem(data));
			revalidatePath("/family");
			revalidatePath(`/family/items/${id}/edit`);
			return { status: "saved", version };
		}
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		if (error instanceof ZodError)
			return { status: "invalid", fields: error.issues.map((issue) => String(issue.path[0])) };
		if (error instanceof Error && error.message === "CONFLICT" && id) {
			const latest = await editorialService()
				.getItem(id)
				.catch(() => undefined);
			return { status: "conflict", latest };
		}
		return { status: "failed" };
	}
	revalidatePath("/family");
	redirect(`/family/items/${createdId}/edit`);
}

export async function changeItemState(
	_previous: ItemFormState,
	data: FormData,
): Promise<ItemFormState> {
	const id = String(data.get("id") ?? "");
	const action = String(data.get("action") ?? "");
	if (!actions.includes(action)) return { status: "failed" };
	try {
		const { version } = await editorialService().transitionItem(
			id,
			Number(data.get("version")),
			action as EditorialAction,
		);
		revalidatePath("/family");
		revalidatePath("/family/archived");
		revalidatePath(`/family/items/${id}/edit`);
		revalidatePath("/archive");
		revalidatePath(`/archive/${id}`);
		return { status: "saved", version };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		if (error instanceof Error && error.message === "CONFLICT")
			return { status: "conflict" };
		return { status: "failed" };
	}
}

export async function addPerson(name: string) {
	try {
		const { id } = await editorialService().savePerson({ name, otherNames: [], familyOnly: false });
		revalidatePath("/family/people");
		return { id, name: name.trim() };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		return null;
	}
}

export async function addPlace(name: string) {
	try {
		const { id } = await editorialService().savePlace({
			name,
			otherNames: [],
			latitude: null,
			longitude: null,
		});
		revalidatePath("/family/places");
		return { id, name: name.trim() };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		return null;
	}
}

const number = (value: FormDataEntryValue | null) =>
	value === null || String(value).trim() === "" ? null : Number(value);
function target(data: FormData) {
	const id = String(data.get("id") ?? "");
	return id ? { id, expectedVersion: Number(data.get("version")) } : undefined;
}
async function saveRecord(path: string, work: () => Promise<unknown>): Promise<ItemFormState> {
	try {
		await work();
		revalidatePath(path);
		return { status: "saved" };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		if (error instanceof ZodError) return { status: "invalid" };
		if (error instanceof Error && error.message === "CONFLICT") return { status: "conflict" };
		return { status: "failed" };
	}
}

export async function savePersonForm(_previous: ItemFormState, data: FormData) {
	return saveRecord("/family/people", () =>
		editorialService().savePerson(
			{
				name: String(data.get("name") ?? ""),
				otherNames: list(data.get("otherNames")),
				familyOnly: data.get("familyOnly") === "on",
			},
			target(data),
		),
	);
}

export async function savePlaceForm(_previous: ItemFormState, data: FormData) {
	return saveRecord("/family/places", () =>
		editorialService().savePlace(
			{
				name: String(data.get("name") ?? ""),
				otherNames: list(data.get("otherNames")),
				latitude: number(data.get("latitude")),
				longitude: number(data.get("longitude")),
			},
			target(data),
		),
	);
}
