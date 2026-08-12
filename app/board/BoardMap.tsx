"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/** Swap for Mapbox or a self-hosted Protomaps style without touching this file. */
const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/liberty";

export type MapFlag = {
  id: string;
  type: "SURPLUS" | "SHORTAGE";
  itemName: string;
  bankId: string;
  bankName: string;
  bankLatitude: number;
  bankLongitude: number;
  isMine: boolean;
};

export type MapHome = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

const SURPLUS = "#047857"; // emerald-700
const SHORTAGE = "#d97706"; // amber-600
const MIXED = "#6366f1"; // indigo-500

/** One point per food bank — every flag a bank posts sits at the same address. */
function toGeoJSON(flags: MapFlag[]) {
  const banks = new Map<
    string,
    { name: string; lat: number; lng: number; surplus: number; shortage: number; isMine: boolean }
  >();

  for (const f of flags) {
    if (!Number.isFinite(f.bankLatitude) || !Number.isFinite(f.bankLongitude)) continue;
    if (f.bankLatitude === 0 && f.bankLongitude === 0) continue; // never geocoded
    const entry = banks.get(f.bankId) ?? {
      name: f.bankName,
      lat: f.bankLatitude,
      lng: f.bankLongitude,
      surplus: 0,
      shortage: 0,
      isMine: f.isMine,
    };
    if (f.type === "SURPLUS") entry.surplus += 1;
    else entry.shortage += 1;
    banks.set(f.bankId, entry);
  }

  return {
    type: "FeatureCollection" as const,
    features: [...banks.entries()].map(([bankId, b]) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
      properties: {
        bankId,
        bankName: b.name,
        surplus: b.surplus,
        shortage: b.shortage,
        total: b.surplus + b.shortage,
        isMine: b.isMine,
        kind: b.surplus > 0 && b.shortage > 0 ? "mixed" : b.surplus > 0 ? "surplus" : "shortage",
      },
    })),
  };
}

export default function BoardMap({
  flags,
  home,
  selectedBankId,
  onSelectBank,
}: {
  flags: MapFlag[];
  home: MapHome | null;
  selectedBankId: string | null;
  onSelectBank: (bankId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectBank);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Kept in a ref so the map's event handlers, bound once, always call the latest.
  useEffect(() => {
    selectRef.current = onSelectBank;
  }, [onSelectBank]);

  /* Create the map once. */
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    (async () => {
      const { Map: MapCtor, NavigationControl, Popup, setWorkerUrl } =
        await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      // Served from /public by scripts/sync-maplibre-worker.mjs — see that file
      // for why the bundler's own resolution of the worker cannot be used.
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      const m = new MapCtor({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [-122.27, 37.8],
        zoom: 7,
        attributionControl: { compact: true },
      });
      map = m;
      mapRef.current = m;

      m.addControl(new NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => {
        // A failed style fetch (offline, blocked host) should degrade, not crash.
        if (String(e.error?.message ?? "").includes("style")) setFailed(true);
      });

      m.on("load", () => {
        if (cancelled) return;
        const map = m;

        map.addSource("banks", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 11,
          clusterProperties: {
            surplus: ["+", ["get", "surplus"]],
            shortage: ["+", ["get", "shortage"]],
            total: ["+", ["get", "total"]],
          },
        });

        // Halo behind the currently selected bank.
        map.addLayer({
          id: "bank-selected",
          type: "circle",
          source: "banks",
          filter: ["==", ["get", "bankId"], "__none__"],
          paint: {
            "circle-radius": 26,
            "circle-color": "#0f766e",
            "circle-opacity": 0.18,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0f766e",
          },
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "banks",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "case",
              ["all", [">", ["get", "surplus"], 0], [">", ["get", "shortage"], 0]], MIXED,
              [">", ["get", "surplus"], 0], SURPLUS,
              SHORTAGE,
            ],
            "circle-radius": ["interpolate", ["linear"], ["get", "total"], 1, 18, 25, 34],
            "circle-opacity": 0.9,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "banks",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "total"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": 13,
          },
          paint: { "text-color": "#ffffff" },
        });

        map.addLayer({
          id: "bank-points",
          type: "circle",
          source: "banks",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match", ["get", "kind"],
              "surplus", SURPLUS,
              "shortage", SHORTAGE,
              MIXED,
            ],
            "circle-radius": ["interpolate", ["linear"], ["get", "total"], 1, 13, 12, 26],
            "circle-opacity": 0.9,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "bank-count",
          type: "symbol",
          source: "banks",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["to-string", ["get", "total"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });

        const popup = new Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
        });

        map.on("mouseenter", "bank-points", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties as
            | { bankName: string; surplus: number; shortage: number }
            | undefined;
          if (!p || !e.lngLat) return;
          const bits = [
            p.surplus > 0 ? `${p.surplus} surplus` : null,
            p.shortage > 0 ? `${p.shortage} shortage` : null,
          ].filter(Boolean);
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font:600 13px system-ui">${p.bankName}</div>` +
                `<div style="font:12px system-ui;color:#57534e">${bits.join(" · ")}</div>`,
            )
            .addTo(map);
        });
        map.on("mouseleave", "bank-points", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });

        map.on("click", "bank-points", (e) => {
          const bankId = e.features?.[0]?.properties?.bankId as string | undefined;
          if (bankId) selectRef.current(bankId);
        });

        map.on("click", "clusters", async (e) => {
          const feature = e.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          if (clusterId == null) return;
          const source = map.getSource("banks") as GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(clusterId as number);
          map.easeTo({
            center: (feature!.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          });
        });

        // Clicking empty map clears the selection.
        map.on("click", (e) => {
          const hits = map.queryRenderedFeatures(e.point, {
            layers: ["bank-points", "clusters"],
          });
          if (hits.length === 0) selectRef.current(null);
        });

        map.on("mouseenter", "clusters", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "clusters", () => {
          map.getCanvas().style.cursor = "";
        });

        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  /* Push filtered flags into the source and frame them. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("banks") as GeoJSONSource | undefined;
    if (!source) return;

    const data = toGeoJSON(flags);
    source.setData(data);

    if (data.features.length === 0) return;
    const lngs = data.features.map((f) => f.geometry.coordinates[0]);
    const lats = data.features.map((f) => f.geometry.coordinates[1]);
    if (home && !(home.latitude === 0 && home.longitude === 0)) {
      lngs.push(home.longitude);
      lats.push(home.latitude);
    }
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    map.fitBounds(bounds, { padding: 70, maxZoom: 11, duration: 600 });
  }, [flags, home, ready]);

  /* Home marker for your own food bank. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !home || (home.latitude === 0 && home.longitude === 0)) return;

    let marker: { remove: () => void } | null = null;
    (async () => {
      const { Marker } = await import("maplibre-gl");
      const el = document.createElement("div");
      el.title = `${home.name} (you)`;
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#1c1917;border:3px solid #fff;box-shadow:0 0 0 2px #1c1917";
      marker = new Marker({ element: el })
        .setLngLat([home.longitude, home.latitude])
        .addTo(map);
    })();

    return () => marker?.remove();
  }, [home, ready]);

  /* Reflect selection into the halo layer. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("bank-selected", ["==", ["get", "bankId"], selectedBankId ?? "__none__"]);
  }, [selectedBankId, ready]);

  if (failed) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        The map tiles couldn&apos;t be loaded. The list below still works.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-stone-200">
      <div ref={containerRef} className="h-[360px] w-full bg-stone-100" />

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 rounded-lg bg-white/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SURPLUS }} />
          Surplus
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SHORTAGE }} />
          Shortage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: MIXED }} />
          Both
        </span>
        <span className="flex items-center gap-1.5 border-t border-stone-200 pt-1">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-stone-900 ring-1 ring-stone-900" />
          You
        </span>
      </div>

      {selectedBankId && (
        <button
          onClick={() => onSelectBank(null)}
          className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-white"
        >
          Clear map selection
        </button>
      )}
    </div>
  );
}
