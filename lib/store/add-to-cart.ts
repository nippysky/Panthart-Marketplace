
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NFTItem } from "../types/types";

interface NFTCartStore {
  cart: NFTItem[];
  addToCart: (nft: NFTItem) => void;
  removeFromCart: (nftAddress: string, tokenId: string) => void;
  isInCart: (nftAddress: string, tokenId: string) => boolean;
  clearCart: () => void;
}

export const useNFTCartStore = create<NFTCartStore>()(
  persist(
    (set, get) => ({
      cart: [],

      addToCart: (nft) => {
        const exists = get().cart.some(
          (item) =>
            item.nftAddress.toLowerCase() === nft.nftAddress.toLowerCase() &&
            item.tokenId === nft.tokenId
        );

        if (!exists) {
          set((state) => ({ cart: [...state.cart, nft] }));
        }
      },

      removeFromCart: (nftAddress, tokenId) => {
        set((state) => ({
          cart: state.cart.filter(
            (item) =>
              item.nftAddress.toLowerCase() !== nftAddress.toLowerCase() ||
              item.tokenId !== tokenId
          ),
        }));
      },

      isInCart: (nftAddress, tokenId) => {
        return get().cart.some(
          (item) =>
            item.nftAddress.toLowerCase() === nftAddress.toLowerCase() &&
            item.tokenId === tokenId
        );
      },

      clearCart: () => set({ cart: [] }),
    }),
    {
      name: "nft-cart-storage", // localStorage key
    }
  )
);
