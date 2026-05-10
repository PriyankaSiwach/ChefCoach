"use client";

import { useCallback } from "react";
import type { Recipe } from "@/types";
import { useLocalStorage } from "./useLocalStorage";

export function useFavourites() {
  const [favourites, setFavourites] = useLocalStorage<Recipe[]>(
    "recipify_favs",
    []
  );

  const toggleFavourite = useCallback(
    (recipe: Recipe) => {
      setFavourites((prev) => {
        const has = prev.some((r) => r.name === recipe.name);
        if (has) return prev.filter((r) => r.name !== recipe.name);
        return [...prev, recipe];
      });
    },
    [setFavourites]
  );

  const removeFavourite = useCallback(
    (name: string) => {
      setFavourites((prev) => prev.filter((r) => r.name !== name));
    },
    [setFavourites]
  );

  const clearFavourites = useCallback(() => {
    setFavourites([]);
  }, [setFavourites]);

  return { favourites, toggleFavourite, removeFavourite, clearFavourites };
}
