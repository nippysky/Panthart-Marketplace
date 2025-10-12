import { create } from "zustand";

interface LoaderState {
  isVisible: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
}

export const useLoaderStore = create<LoaderState>((set) => ({
  isVisible: false,
  message: "Please wait...",
  show: (message = "Please wait...") => set({ isVisible: true, message }),
  hide: () => set({ isVisible: false, message: "Please wait..." }),
}));