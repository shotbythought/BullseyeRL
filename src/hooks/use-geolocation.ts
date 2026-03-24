"use client";

import { useEffect, useState } from "react";

export interface GeolocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export function useGeolocation() {
  const [position, setPosition] = useState<GeolocationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("This browser does not support geolocation.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (snapshot) => {
        setPosition({
          latitude: snapshot.coords.latitude,
          longitude: snapshot.coords.longitude,
          accuracy: snapshot.coords.accuracy ?? null,
        });
        setError(null);
      },
      (geolocationError) => {
        setError(geolocationError.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return {
    position,
    error,
  };
}
