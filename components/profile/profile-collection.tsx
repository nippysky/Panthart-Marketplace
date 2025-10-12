import CollectionArtDisplay from "@/components/collection/collection-art-display";
import CollectionArtDisplaySkeleton from "@/components/skeleton/CollectionArtDisplaySkeleton";
import { Collection } from "@/lib/types/types";

export default function ProfileCollection({
  ownedCollectionArray,
  isLoading,
}: {
  ownedCollectionArray: Collection[];
  isLoading: boolean;
}) {
  return (
    <section className="w-full mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-7">
      {isLoading
        ? ownedCollectionArray.map((_, i) => (
            <CollectionArtDisplaySkeleton key={i} />
          ))
        : ownedCollectionArray.map((collection) => (
            <CollectionArtDisplay
              key={collection.id}
              collection={collection}
            />
          ))}
    </section>
  );
}
