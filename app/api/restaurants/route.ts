import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Origin = { lat: number; lon: number };
type Place = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lon?: number;
  distance?: number;
};
type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  namedetails?: Record<string, string>;
};
type OverpassItem = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const osmHeaders = {
  "User-Agent": "Lunchdags/1.0 (https://lunchdags.vercel.app)",
  "Accept-Language": "sv,en;q=0.8",
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2-lat1)*p)/2
    + Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2;
  return 12742 * Math.asin(Math.sqrt(a));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: osmHeaders,
    cache: "no-store",
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`OpenStreetMap svarade med ${response.status}`);
  return response.json() as Promise<T>;
}

async function geocodeArea(area: string): Promise<Origin | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "se",
    q: area,
  });
  const matches = await getJson<NominatimResult[]>(
    `https://nominatim.openstreetmap.org/search?${params}`,
  );
  if (!matches[0]) return null;
  return { lat: Number(matches[0].lat), lon: Number(matches[0].lon) };
}

async function searchByName(query: string, origin: Origin | null): Promise<Place[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "20",
    countrycodes: "se",
    namedetails: "1",
    addressdetails: "1",
    q: query,
  });

  if (origin) {
    const latSpan = 0.09;
    const lonSpan = 0.15;
    params.set(
      "viewbox",
      `${origin.lon-lonSpan},${origin.lat+latSpan},${origin.lon+lonSpan},${origin.lat-latSpan}`,
    );
    params.set("bounded", "1");
  }

  const results = await getJson<NominatimResult[]>(
    `https://nominatim.openstreetmap.org/search?${params}`,
  );

  return results.map((item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const name = item.namedetails?.name ?? item.name
      ?? item.display_name.split(",")[0]
      ?? "Restaurang";
    const address = item.display_name.split(",").slice(1, 4).join(",").trim()
      || "Adress saknas";
    return {
      id: `osm-${item.place_id}`,
      name,
      address,
      lat,
      lon,
      distance: origin ? distanceKm(origin.lat, origin.lon, lat, lon) : undefined,
    };
  }).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

async function nearbyRestaurants(origin: Origin, query = ""): Promise<Place[]> {
  const statement = `[out:json][timeout:18];(
    node["amenity"~"restaurant|cafe|fast_food"](around:4000,${origin.lat},${origin.lon});
    way["amenity"~"restaurant|cafe|fast_food"](around:4000,${origin.lat},${origin.lon});
    relation["amenity"~"restaurant|cafe|fast_food"](around:4000,${origin.lat},${origin.lon});
  );out center tags;`;
  const params = new URLSearchParams({ data: statement });
  const data = await getJson<{ elements: OverpassItem[] }>(
    `https://overpass-api.de/api/interpreter?${params}`,
  );
  const needle = query.toLocaleLowerCase("sv");

  return data.elements
    .filter((item) => item.tags?.name)
    .map((item) => {
      const lat = item.lat ?? item.center?.lat;
      const lon = item.lon ?? item.center?.lon;
      const street = [item.tags?.["addr:street"], item.tags?.["addr:housenumber"]]
        .filter(Boolean).join(" ");
      return {
        id: `osm-${item.type}-${item.id}`,
        name: item.tags?.name ?? "Restaurang",
        address: street || item.tags?.cuisine || "Nära sökområdet",
        lat,
        lon,
        distance: lat !== undefined && lon !== undefined
          ? distanceKm(origin.lat, origin.lon, lat, lon)
          : undefined,
      };
    })
    .filter((place) => !needle || place.name.toLocaleLowerCase("sv").includes(needle))
    .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))
    .slice(0, 20);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const area = request.nextUrl.searchParams.get("area")?.trim() ?? "";
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));

  try {
    let origin: Origin | null =
      Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0
        ? { lat, lon }
        : null;

    if (!origin && area) {
      origin = await geocodeArea(area);
      if (!origin) {
        return NextResponse.json(
          { error: "Området eller adressen kunde inte hittas." },
          { status: 404 },
        );
      }
    }

    if (!query && !origin) {
      return NextResponse.json(
        { error: "Skriv ett restaurangnamn eller använd område/GPS." },
        { status: 400 },
      );
    }

    let places = query ? await searchByName(query, origin) : [];
    if (origin && (!query || places.length === 0)) {
      places = await nearbyRestaurants(origin, query);
    }

    return NextResponse.json({ places: places.slice(0, 20) });
  } catch (error) {
    console.error("Restaurant search failed", error);
    return NextResponse.json(
      { error: "Restaurangsökningen svarade inte. Försök igen om en liten stund." },
      { status: 502 },
    );
  }
}
