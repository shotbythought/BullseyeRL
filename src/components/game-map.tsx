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
  const playerMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const playerPreviewCircleRef = useRef<google.maps.Circle | null>(null);
  const playerAccuracyCircleRef = useRef<google.maps.Circle | null>(null);
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
      if (playerMarkerRef.current) {
        playerMarkerRef.current.map = null;
        playerMarkerRef.current = null;
      }
      if (playerPreviewCircleRef.current) {
        playerPreviewCircleRef.current.setMap(null);
        playerPreviewCircleRef.current = null;
      }
      if (playerAccuracyCircleRef.current) {
        playerAccuracyCircleRef.current.setMap(null);
        playerAccuracyCircleRef.current = null;
      }
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

    }
  }, [props.closerHintCircle, props.guesses, mapReady, props.revealTarget]);

  useEffect(() => {
    const googleMaps = googleRef.current;
    const map = mapRef.current;

    if (!googleMaps || !map || !mapReady) {
      return;
    }

    const position = props.currentPosition;
    if (!position) {
      if (playerMarkerRef.current) {
        playerMarkerRef.current.map = null;
        playerMarkerRef.current = null;
      }
      if (playerPreviewCircleRef.current) {
        playerPreviewCircleRef.current.setMap(null);
        playerPreviewCircleRef.current = null;
      }
      if (playerAccuracyCircleRef.current) {
        playerAccuracyCircleRef.current.setMap(null);
        playerAccuracyCircleRef.current = null;
      }
      return;
    }

    const playerLatLng = {
      lat: position.latitude,
      lng: position.longitude,
    };

    let marker = playerMarkerRef.current;
    if (!marker) {
      marker = new googleMaps.maps.marker.AdvancedMarkerElement({
        map,
        position: playerLatLng,
        title: "Your current position",
      });
      playerMarkerRef.current = marker;
    } else {
      marker.map = map;
      marker.position = playerLatLng;
    }

    const selectedRadius = props.selectedRadius;
    if (selectedRadius) {
      let preview = playerPreviewCircleRef.current;
      if (!preview) {
        preview = new googleMaps.maps.Circle({
          map,
          center: playerLatLng,
          radius: selectedRadius,
          fillColor: "#2f80ed",
          fillOpacity: 0.18,
          strokeColor: "#2f80ed",
          strokeWeight: 2,
        });
        playerPreviewCircleRef.current = preview;
      } else {
        preview.setMap(map);
        preview.setCenter(playerLatLng);
        preview.setRadius(selectedRadius);
      }
    } else if (playerPreviewCircleRef.current) {
      playerPreviewCircleRef.current.setMap(null);
      playerPreviewCircleRef.current = null;
    }

    const accuracyMeters = props.currentAccuracy;
    if (accuracyMeters) {
      let accuracyCircle = playerAccuracyCircleRef.current;
      if (!accuracyCircle) {
        accuracyCircle = new googleMaps.maps.Circle({
          map,
          center: playerLatLng,
          radius: accuracyMeters,
          fillColor: "#6d7f77",
          fillOpacity: 0.08,
          strokeColor: "#6d7f77",
          strokeOpacity: 0.4,
          strokeWeight: 1,
        });
        playerAccuracyCircleRef.current = accuracyCircle;
      } else {
        accuracyCircle.setMap(map);
        accuracyCircle.setCenter(playerLatLng);
        accuracyCircle.setRadius(accuracyMeters);
      }
    } else if (playerAccuracyCircleRef.current) {
      playerAccuracyCircleRef.current.setMap(null);
      playerAccuracyCircleRef.current = null;
    }
  }, [
    mapReady,
    props.currentAccuracy,
    props.currentPosition,
    props.currentPosition?.latitude,
    props.currentPosition?.longitude,
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

  return <div className="h-[28rem] w-full overflow-hidden rounded-[0.875rem]" ref={containerRef} />;
}
