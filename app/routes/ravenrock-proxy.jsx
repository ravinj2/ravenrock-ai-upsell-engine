import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";

export async function loader({ request }) {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  return { ok: true, shop: url.searchParams.get("shop") };
}

export default function RavenRockProxy() {
  const data = useLoaderData();
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
