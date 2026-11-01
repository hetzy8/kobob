import { accessSystem } from "@/lib/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
	try {
		return await accessSystem().handle(request);
	} catch {
		return Response.json(
			{ error: "SERVICE_UNAVAILABLE" },
			{ status: 503, headers: { "Cache-Control": "private, no-store" } },
		);
	}
}
export const GET = POST;
