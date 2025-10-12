import useSWR from "swr";

type UserBrief = {
  profileAvatar: string;
  updatedAt: string; // ISO string
};

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error("Network response was not ok");
    return res.json();
  });

export function useUserByWallet(address?: string) {
  const shouldFetch = !!address;

const { data, error, isLoading, mutate } = useSWR<UserBrief>(
  shouldFetch ? `/api/user-info?address=${encodeURIComponent(address!)}` : null,
  fetcher,
  { revalidateOnFocus: true, revalidateOnReconnect: true, revalidateIfStale: true }
);


  return {
    user: data,
    isLoading,
    error,
    mutate, // you can call this after a profile PATCH to force-refresh immediately
  };
}
