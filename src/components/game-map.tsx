"use client";

import { Loader } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";

import type { LiveGuess, MapBounds } from "@/types/app";

interface GuessMapProps {
  currentPosition:
    | {
        latitude: number;
        longitude: number;
      }
    | null;
  currentAccuracy: number | null;
  selectedRadius: number | null;
  guesses: LiveGuess[];
  closerHintCircle:
    | {
        lat: number;
        lng: number;
        radiusMeters: number;
      }
    | null;
  mapBounds: MapBounds;
  roundKey: string;
  revealTarget:
    | {
        lat: number;
        lng: number;
      }
    | null;
  revealRadii: number[];
}

export function GameMap(props: GuessMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const googleRef = useRef<typeof google | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<() => void>>([]);
  const mapListenersRef = useRef<Array<() => void>>([]);
  const viewportLockedRef = useRef(false);
  const hasUserMovedViewportRef = useRef(false);
  const lastRoundKeyRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initialiseMap() {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

      if (!apiKey) {
        return;
      }

      const loader = new Loader({
        apiKey,
        version: "weekly",
      });

      const [{ Map }] = await Promise.all([
        loader.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        loader.importLibrary("marker"),
      ]);

      if (cancelled || !containerRef.current) {
        return;
      }

      googleRef.current = google;
      mapRef.current = new Map(containerRef.current, {
        center: { lat: 37.7749, lng: -122.4194 },
        zoom: 11,
        mapId: "bullseyerl-live-map",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });

      const map = mapRef.current;
      const listeners = [
        map.addListener("dragstart", () => {
          if (!viewportLockedRef.current) {
            hasUserMovedViewportRef.current = true;
          }
        }),
        map.addListener("zoom_changed", () => {
          if (!viewportLockedRef.current) {
            hasUserMovedViewportRef.current = true;
          }
        }),
      ];

      mapListenersRef.current = [() => {
        listeners.forEach((listener) => listener.remove());
      }];

      setMapReady(true);
    }

    void initialiseMap();

    return () => {
      cancelled = true;
      overlaysRef.current.forEach((dispose) => dispose());
      overlaysRef.current = [];
      mapListenersRef.current.forEach((dispose) => dispose());
      mapListenersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const googleMaps = googleRef.current;
    const map = mapRef.current;

    if (!googleMaps || !map || !mapReady) {
      return;
    }

    overlaysRef.current.forEach((dispose) => dispose());
    overlaysRef.current = [];

    if (props.currentPosition) {
      const playerLatLng = {
        lat: props.currentPosition.latitude,
        lng: props.currentPosition.longitude,
      };

      const playerMarker = new googleMaps.maps.marker.AdvancedMarkerElement({
        map,
        position: playerLatLng,
        title: "Your current position",
      });

      overlaysRef.current.push(() => {
        playerMarker.map = null;
      });

      if (props.selectedRadius) {
        const previewCircle = new googleMaps.maps.Circle({
          map,
          center: playerLatLng,
          radius: props.selectedRadius,
          fillColor: "#2f80ed",
          fillOpacity: 0.18,
          strokeColor: "#2f80ed",
          strokeWeight: 2,
        });

        overlaysRef.current.push(() => {
          previewCircle.setMap(null);
        });
      }

      if (props.currentAccuracy) {
        const accuracyCircle = new googleMaps.maps.Circle({
          map,
          center: playerLatLng,
          radius: props.currentAccuracy,
          fillColor: "#6d7f77",
          fillOpacity: 0.08,
          strokeColor: "#6d7f77",
          strokeOpacity: 0.4,
          strokeWeight: 1,
        });

        overlaysRef.current.push(() => {
          accuracyCircle.setMap(null);
        });
      }
    }

    props.guesses.forEach((guess) => {
      const center = {
        lat: guess.guessLat,
        lng: guess.guessLng,
      };

      const guessCircle = new googleMaps.maps.Circle({
        map,
        center,
        radius: guess.selectedRadiusMeters,
        fillColor: guess.isSuccess ? "#4caf50" : "#c46a42",
        fillOpacity: 0.16,
        strokeColor: guess.isSuccess ? "#2e7d32" : "#9c4a29",
        strokeWeight: 2,
      });

      overlaysRef.current.push(() => {
        guessCircle.setMap(null);
      });
    });

    if (props.closerHintCircle) {
      const hintCircle = new googleMaps.maps.Circle({
        map,
        center: {
          lat: props.closerHintCircle.lat,
          lng: props.closerHintCircle.lng,
        },
        radius: props.closerHintCircle.radiusMeters,
        fillColor: "#f4c542",
        fillOpacity: 0.14,
        strokeColor: "#b58a00",
        strokeOpacity: 0.9,
        strokeWeight: 2,
      });

      overlaysRef.current.push(() => {
        hintCircle.setMap(null);
      });
    }

    if (props.revealTarget) {
      const targetMarker = new googleMaps.maps.marker.AdvancedMarkerElement({
        map,
        position: props.revealTarget,
        title: "Target location",
      });

      overlaysRef.current.push(() => {
        targetMarker.map = null;
      });

      props.revealRadii.forEach((radius) => {
        const bullseyeCircle = new googleMaps.maps.Circle({
          map,
          center: props.revealTarget!,
          radius,
          fillOpacity: 0,
          strokeColor: "#0d1613",
          strokeOpacity: 0.5,
          strokeWeight: 1.5,
        });

        overlaysRef.current.push(() => {
          bullseyeCircle.setMap(null);
        });
      });
    }
  }, [
    props.closerHintCircle,
    props.currentAccuracy,
    props.currentPosition,
    props.guesses,
    mapReady,
    props.revealRadii,
    props.revealTarget,
    props.selectedRadius,
  ]);

  useEffect(() => {
    const googleMaps = googleRef.current;
    const map = mapRef.current;

    if (!googleMaps || !map || !mapReady) {
      return;
    }

    if (lastRoundKeyRef.current === props.roundKey) {
      return;
    }

    hasUserMovedViewportRef.current = false;
    lastRoundKeyRef.current = props.roundKey;

    viewportLockedRef.current = true;

    const bounds = new googleMaps.maps.LatLngBounds(
      { lat: props.mapBounds.south, lng: props.mapBounds.west },
      { lat: props.mapBounds.north, lng: props.mapBounds.east },
    );

    map.fitBounds(bounds, 80);

    const idleListener = googleMaps.maps.event.addListenerOnce(map, "idle", () => {
      viewportLockedRef.current = false;
    });

    return () => {
      idleListener.remove();
      viewportLockedRef.current = false;
    };
  }, [mapReady, props.mapBounds, props.roundKey]);

  return <div className="h-[28rem] w-full overflow-hidden rounded-[2rem]" ref={containerRef} />;
}
