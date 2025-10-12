import { create } from "zustand";

type IndexingState = {
  isIndexing: boolean;
  setIsIndexing: (value: boolean) => void;
};

/**
 * Global flag telling the app whether any currently viewed collection
 * is still indexing. Kept simple on purpose.
 */
export const useIndexingStore = create<IndexingState>((set) => ({
  isIndexing: false,
  setIsIndexing: (value) => set({ isIndexing: value }),
}));
