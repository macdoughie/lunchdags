"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award, ChevronRight, Crown, LocateFixed, MapPin, Plus, Search,
  Sparkles, Star, Trash2, UserRound, UsersRound, UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import {
  connectLunchState, firebaseEnabled, LunchState, Member,
  saveLunchState, Visit,
} from "@/lib/firebase";

const COLORS = ["#ffc847", "#18b7a4", "#ff665d", "#8cd17d", "#f58a35", "#77a8ff"];
const initialState: LunchState = {
  members: [],
  chooserIndex: 0,
  visits: [],
};

type Place = { id: string; name: string; address: string; lat?: number; lon?: number; distance?: number };
type SearchOrigin = { lat: number; lon: number };

function average(ratings: Visit["ratings"]) {
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length : 0;
}

export function LunchdagsApp() {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState("home");
  const [newMember, setNewMember] = useState("");
  const [query, setQuery] = useState("");
  const [searchArea, setSearchArea] = useState("");
  const [gpsOrigin, setGpsOrigin] = useState<SearchOrigin | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [remote, setRemote] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    connectLunchState(initialState, (next) => {
      setState(next);
      setRemote(true);
    }, () => toast.error("Kunde inte ansluta till gruppens data."))
      .then((stop) => { unsubscribe = stop; });
    return () => unsubscribe();
  }, []);

  const update = async (next: LunchState) => {
    setState(next);
    if (firebaseEnabled) {
      try { await saveLunchState(next); setRemote(true); }
      catch { toast.error("Ändringen kunde inte sparas."); }
    }
  };

  const chooser = state.members[state.chooserIndex % Math.max(state.members.length, 1)];
  const leaderboard = useMemo(() => {
    const grouped = new Map<string, { name: string; ratings: Visit["ratings"]; visits: number }>();
    state.visits.forEach((visit) => {
      const found = grouped.get(visit.restaurantId) ?? { name: visit.restaurantName, ratings: [], visits: 0 };
      found.ratings.push(...visit.ratings);
      found.visits += 1;
      grouped.set(visit.restaurantId, found);
    });
    return [...grouped.values()].map((item) => ({ ...item, score: average(item.ratings) })).sort((a,b) => b.score-a.score);
  }, [state.visits]);

  const addMember = () => {
    const name = newMember.trim();
    if (!name) return;
    const member: Member = { id: crypto.randomUUID(), name, color: COLORS[state.members.length % COLORS.length] };
    update({ ...state, members: [...state.members, member] });
    setNewMember("");
    toast.success(`${name} är med i lunchgänget`);
  };

  const removeMember = (id: string) => {
    const members = state.members.filter((member) => member.id !== id);
    update({ ...state, members, chooserIndex: members.length ? state.chooserIndex % members.length : 0 });
  };

  const runRestaurantSearch = async (origin?: SearchOrigin | null) => {
    const restaurant = query.trim();
    const area = searchArea.trim();
    const activeOrigin = area ? null : (origin ?? gpsOrigin);

    if (!restaurant && !area && !activeOrigin) {
      toast.info("Skriv ett restaurangnamn eller använd område/GPS.");
      return;
    }

    setSearching(true);
    setPlaces([]);
    try {
      const params = new URLSearchParams();
      if (restaurant) params.set("q", restaurant);
      if (area) params.set("area", area);
      if (activeOrigin) {
        params.set("lat", String(activeOrigin.lat));
        params.set("lon", String(activeOrigin.lon));
      }

      const response = await fetch(`/api/restaurants?${params}`);
      const data = await response.json() as { places?: Place[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Sökningen misslyckades.");

      const found = data.places ?? [];
      setPlaces(found);
      if (!found.length) {
        toast.info("Inga träffar. Prova ett kortare namn eller ta bort avgränsningen.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restaurangsökningen svarade inte.");
    } finally {
      setSearching(false);
    }
  };

  const searchNearby = () => {
    if (!navigator.geolocation) {
      toast.error("GPS stöds inte på den här enheten. Sök med område i stället.");
      return;
    }

    setSearching(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const origin = { lat: coords.latitude, lon: coords.longitude };
      setGpsOrigin(origin);
      setSearchArea("");
      toast.success("GPS används för att begränsa sökningen.");
      await runRestaurantSearch(origin);
    }, () => {
      setSearching(false);
      toast.error("GPS nekades. Du kan fortfarande söka med restaurangnamn eller område.");
    }, { enableHighAccuracy: true, timeout: 12000 });
  };

  const choosePlace = (place: Place) => {
    setSelected(place);
    setDraftScores(Object.fromEntries(state.members.map((member) => [member.id, 7])));
    setTab("rate");
  };

  const saveVisit = async () => {
    if (!selected || !chooser || !state.members.length) return;
    const visit: Visit = {
      id: crypto.randomUUID(),
      restaurantId: selected.id,
      restaurantName: selected.name,
      address: selected.address,
      date: new Date().toISOString().slice(0,10),
      chooserId: chooser.id,
      ratings: state.members.map((member) => ({ memberId: member.id, score: draftScores[member.id] ?? 7 })),
    };
    await update({ ...state, visits: [visit, ...state.visits], chooserIndex: (state.chooserIndex + 1) % state.members.length });
    setSelected(null);
    setTab("leaderboard");
    toast.success("Lunchbetygen är sparade!");
  };

  const memberName = (id: string) => state.members.find((member) => member.id === id)?.name ?? "Tidigare medlem";

  return (
    <main className="lunch-bg px-3 py-4 sm:px-6 sm:py-8">
      <Toaster position="top-center" richColors />
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-center justify-between px-2 text-white">
          <div className="flex items-center gap-3">
            <div className="grid size-12 rotate-[-5deg] place-items-center rounded-2xl bg-[#ffc847] text-[#10283e] shadow-lg">
              <UtensilsCrossed className="size-7" strokeWidth={2.6} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">LUNCHDAGS!</h1>
              <p className="text-sm font-bold text-[#b9d2e5]">Välj. Ät. Betygsätt. Upprepa.</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-[#06182d]/70 px-3 py-2 text-sm sm:flex">
            <span className={`size-2 rounded-full ${remote ? "bg-emerald-400" : "bg-amber-400"}`} />
            {remote ? "Gemensam data" : "Demoläge"}
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="glass mb-4 grid h-auto w-full grid-cols-5 gap-1 rounded-2xl p-1.5">
            {[
              ["home", UsersRound, "Gänget"], ["find", Search, "Hitta"], ["rate", Star, "Betyg"],
              ["leaderboard", Award, "Topplista"], ["favorites", Sparkles, "Favoriter"],
            ].map(([value, Icon, label]) => (
              <TabsTrigger key={value as string} value={value as string} className="h-14 flex-col gap-1 rounded-xl px-1 text-xs font-bold text-white/65 data-[state=active]:bg-[#ffc847] data-[state=active]:text-[#10283e] sm:h-12 sm:flex-row sm:text-sm">
                <Icon className="size-4" />{label as string}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="home" className="grid gap-4 md:grid-cols-[1.15fr_.85fr]">
            <section className="glass rounded-[1.8rem] p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-black uppercase tracking-[.16em] text-[#ffc847]">Lunchgänget</p>
                  <h2 className="text-2xl font-black">Vilka ska med?</h2>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{state.members.length} personer</div>
              </div>
              <div className="space-y-2">
                {state.members.map((member, index) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.055] p-3">
                    <div className="grid size-10 place-items-center rounded-xl text-sm font-black text-[#092238]" style={{ background: member.color }}>{member.name.slice(0,2).toUpperCase()}</div>
                    <span className="flex-1 font-bold">{member.name}</span>
                    {index === state.chooserIndex ? (
                      <span className="rounded-full bg-[#ffc847]/15 px-2.5 py-1 text-xs font-black text-[#ffc847]">VÄLJER NU</span>
                    ) : (
                      <button
                        onClick={() => {
                          update({ ...state, chooserIndex: index });
                          toast.success(`${member.name} väljer nästa lunchställe`);
                        }}
                        className="rounded-full border border-[#18b7a4]/40 bg-[#18b7a4]/10 px-2.5 py-1 text-xs font-black text-[#55dcc9] transition hover:bg-[#18b7a4] hover:text-[#062238]"
                      >
                        SÄTT PÅ TUR
                      </button>
                    )}
                    <button onClick={() => removeMember(member.id)} aria-label={`Ta bort ${member.name}`} className="rounded-lg p-2 text-white/45 hover:bg-white/10 hover:text-[#ff8179]"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Input value={newMember} onChange={(event) => setNewMember(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addMember()} placeholder="Lägg till namn" className="h-12 border-white/15 bg-white/10 text-base placeholder:text-white/45" />
                <Button onClick={addMember} className="h-12 bg-[#18b7a4] px-4 font-black text-[#062238] hover:bg-[#3ed0bc]"><Plus /> Lägg till</Button>
              </div>
            </section>

            <aside className="glass flex min-h-64 flex-col justify-between overflow-hidden rounded-[1.8rem] p-6">
              <div>
                <p className="text-sm font-black uppercase tracking-[.16em] text-[#18b7a4]">På tur</p>
                {chooser ? (
                  <>
                    <div className="mt-5 flex items-center gap-4">
                      <div className="grid size-16 place-items-center rounded-2xl text-xl font-black text-[#092238]" style={{ background: chooser.color }}>{chooser.name.slice(0,2).toUpperCase()}</div>
                      <div><h2 className="text-3xl font-black">{chooser.name}</h2><p className="text-[#b8cada]">väljer dagens lunchställe</p></div>
                    </div>
                    <Button onClick={() => setTab("find")} className="mt-6 h-13 w-full bg-[#ffc847] text-base font-black text-[#10283e] hover:bg-[#ffda78]">Hitta lunch <ChevronRight /></Button>
                  </>
                ) : <p className="mt-5 text-[#b8cada]">Lägg till minst en person för att börja.</p>}
              </div>
              {state.visits[0] && <p className="mt-5 border-t border-white/10 pt-4 text-sm text-[#b8cada]">Senast: <strong className="text-white">{state.visits[0].restaurantName}</strong> · {average(state.visits[0].ratings).toFixed(1)}</p>}
            </aside>
          </TabsContent>

          <TabsContent value="find">
            <section className="glass rounded-[1.8rem] p-5 sm:p-7">
              <div className="max-w-2xl">
                <p className="mb-1 text-sm font-black uppercase tracking-[.16em] text-[#18b7a4]">Restaurangsökning</p>
                <h2 className="text-2xl font-black">Hitta dagens lunch</h2>
                <p className="mt-1 text-[#b8cada]">{chooser ? `${chooser.name} väljer. Sök på restaurangen; område eller GPS är frivillig avgränsning.` : "Lägg först till lunchgänget."}</p>
              </div>
              <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/45" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && runRestaurantSearch()}
                    placeholder="Sök restaurang, till exempel Pong"
                    className="h-13 border-white/15 bg-white/10 pl-12 text-base placeholder:text-white/45"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/45" />
                    <Input
                      value={searchArea}
                      onChange={(event) => {
                        setSearchArea(event.target.value);
                        if (event.target.value) setGpsOrigin(null);
                      }}
                      onKeyDown={(event) => event.key === "Enter" && runRestaurantSearch()}
                      placeholder="Område eller adress (valfritt)"
                      className="h-13 border-white/15 bg-white/10 pl-12 text-base placeholder:text-white/45"
                    />
                  </div>
                  <Button onClick={() => runRestaurantSearch()} disabled={searching || !chooser} className="h-13 bg-[#18b7a4] px-5 font-black text-[#062238] hover:bg-[#3ed0bc]">
                    <Search />{searching ? "Söker…" : "Sök restaurang"}
                  </Button>
                  <Button onClick={searchNearby} disabled={searching || !chooser} variant="outline" className="h-13 border-[#ffc847]/50 bg-[#ffc847]/10 px-5 font-black text-[#ffc847] hover:bg-[#ffc847] hover:text-[#10283e]">
                    <LocateFixed className={searching ? "animate-pulse" : ""} />{gpsOrigin ? "GPS aktiv" : "Använd GPS"}
                  </Button>
                </div>
                <p className="px-1 text-xs text-[#b8cada]">
                  Sök på bara restaurangnamnet i hela Sverige, eller begränsa träffarna med område/adress eller GPS.
                </p>
              </div>
              {!places.length && !searching && (
                <div className="mt-6 grid min-h-52 place-items-center rounded-2xl border border-dashed border-white/20 bg-white/[.035] text-center">
                  <div><MapPin className="mx-auto mb-3 size-9 text-[#ffc847]" /><p className="font-bold">Välj själv hur du vill söka.</p><p className="mt-1 text-sm text-[#b8cada]">GPS är frivilligt och positionen sparas aldrig.</p></div>
                </div>
              )}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {places.map((place) => (
                  <button key={place.id} onClick={() => choosePlace(place)} className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-white/12 bg-white/[.06] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#ffc847]/60 hover:bg-white/10">
                    <img src="/restaurant-cartoon.png" alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1"><p className="truncate font-black">{place.name}</p><p className="truncate text-sm text-[#b8cada]">{place.address}{place.distance !== undefined ? ` · ${place.distance.toFixed(1)} km` : ""}</p></div>
                    <ChevronRight className="size-5 text-white/35 group-hover:text-[#ffc847]" />
                  </button>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="rate">
            <section className="glass rounded-[1.8rem] p-5 sm:p-7">
              {selected ? (
                <>
                  <img src="/restaurant-cartoon.png" alt="Tecknad lunchrestaurang" className="mb-5 h-40 w-full rounded-2xl object-cover object-center sm:h-52" />
                  <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-black uppercase tracking-[.16em] text-[#ff8078]">Sätt betyg 1–10</p><h2 className="mt-1 text-3xl font-black">{selected.name}</h2><p className="mt-1 flex items-center gap-1.5 text-[#b8cada]"><MapPin className="size-4" />{selected.address}</p></div>
                    <div className="rounded-2xl bg-white/[.07] px-4 py-3 text-sm"><span className="text-[#b8cada]">Valt av </span><strong>{chooser?.name}</strong></div>
                  </div>
                  <div className="my-6 space-y-5">
                    {state.members.map((member) => {
                      const score = draftScores[member.id] ?? 7;
                      return <div key={member.id} className="grid grid-cols-[44px_1fr_48px] items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-xl font-black text-[#092238]" style={{ background: member.color }}>{member.name.slice(0,2).toUpperCase()}</div>
                        <div><div className="mb-2 flex justify-between text-sm"><strong>{member.name}</strong><span className="text-[#b8cada]">{score < 5 ? "Nja…" : score < 8 ? "Bra!" : "Fullträff!"}</span></div><Slider min={1} max={10} step={1} value={[score]} onValueChange={(value) => setDraftScores({ ...draftScores, [member.id]: value[0] })} className="[&_[data-slot=slider-range]]:score-gradient [&_[data-slot=slider-track]]:h-2.5 [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-4 [&_[data-slot=slider-thumb]]:border-[#ffc847]" /></div>
                        <div className="grid size-12 place-items-center rounded-xl bg-[#ffc847] text-xl font-black text-[#10283e]">{score}</div>
                      </div>;
                    })}
                  </div>
                  <Button onClick={saveVisit} className="h-14 w-full bg-[#18b7a4] text-base font-black text-[#062238] hover:bg-[#3ed0bc]"><Star className="fill-current" /> Spara alla betyg</Button>
                </>
              ) : (
                <div className="grid min-h-80 place-items-center text-center"><div><Star className="mx-auto mb-4 size-11 text-[#ffc847]" /><h2 className="text-2xl font-black">Inget ställe valt ännu</h2><p className="mt-2 text-[#b8cada]">Hitta en restaurang först, sedan kan alla sätta sitt betyg.</p><Button onClick={() => setTab("find")} className="mt-5 bg-[#ffc847] font-black text-[#10283e]">Hitta lunch</Button></div></div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="leaderboard">
            <section className="glass rounded-[1.8rem] p-5 sm:p-7">
              <p className="mb-1 text-sm font-black uppercase tracking-[.16em] text-[#ffc847]">Gruppens dom</p>
              <h2 className="text-2xl font-black">Bästa lunchställena</h2>
              <div className="mt-6 space-y-3">
                {leaderboard.map((item, index) => (
                  <div key={item.name} className={`flex items-center gap-4 rounded-2xl border p-4 ${index === 0 ? "border-[#ffc847]/50 bg-[#ffc847]/10" : "border-white/10 bg-white/[.05]"}`}>
                    <div className={`grid size-11 shrink-0 place-items-center rounded-xl font-black ${index === 0 ? "bg-[#ffc847] text-[#10283e]" : "bg-white/10"}`}>{index === 0 ? <Crown className="size-5" /> : index + 1}</div>
                    <img src="/restaurant-cartoon.png" alt="" className="hidden h-14 w-20 shrink-0 rounded-xl object-cover sm:block" />
                    <div className="min-w-0 flex-1"><p className="truncate text-lg font-black">{item.name}</p><p className="text-sm text-[#b8cada]">{item.visits} besök · {item.ratings.length} betyg</p></div>
                    <div className="text-right"><p className="text-2xl font-black text-[#ffc847]">{item.score.toFixed(1)}</p><p className="text-xs text-[#b8cada]">av 10</p></div>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="favorites">
            <section className="glass rounded-[1.8rem] p-5 sm:p-7">
              <p className="mb-1 text-sm font-black uppercase tracking-[.16em] text-[#18b7a4]">Personliga val</p>
              <h2 className="text-2xl font-black">Varsin favorit</h2>
              <p className="mt-1 text-[#b8cada]">Stället som varje person har gett sitt högsta betyg.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {state.members.map((member) => {
                  const rated = state.visits.flatMap((visit) => visit.ratings.filter((rating) => rating.memberId === member.id).map((rating) => ({ ...visit, score: rating.score }))).sort((a,b) => b.score-a.score);
                  const favorite = rated[0];
                  return <article key={member.id} className="rounded-2xl border border-white/10 bg-white/[.055] p-5">
                    <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl font-black text-[#092238]" style={{ background: member.color }}>{member.name.slice(0,2).toUpperCase()}</div><div><h3 className="font-black">{member.name}</h3><p className="text-sm text-[#b8cada]">personlig etta</p></div></div>
                    {favorite ? <><img src="/restaurant-cartoon.png" alt="" className="mt-5 h-28 w-full rounded-xl object-cover" /><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-lg font-black">{favorite.restaurantName}</p><p className="text-sm text-[#b8cada]">Valt av {memberName(favorite.chooserId)}</p></div><div className="rounded-xl bg-[#ffc847] px-3 py-2 text-xl font-black text-[#10283e]">{favorite.score}</div></div></> : <p className="mt-5 text-sm text-[#b8cada]">Inga betyg ännu.</p>}
                  </article>;
                })}
              </div>
            </section>
          </TabsContent>
        </Tabs>
        <footer className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-white/45"><UserRound className="size-3.5" /> Privat lunchgrupp · position används bara vid sökning</footer>
      </div>
    </main>
  );
}
