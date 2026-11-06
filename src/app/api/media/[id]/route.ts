import { mediaReader } from "@/services/media-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return mediaReader().read(id, request.headers.get("range"));
}
