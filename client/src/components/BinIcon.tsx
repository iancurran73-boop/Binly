import generalBin from "@/assets/bin-general.png";
import recyclingBin from "@/assets/bin-recycling.png";
import gardenBin from "@/assets/bin-garden.png";
import foodBin from "@/assets/bin-food.png";

export type BinKind = "general" | "recycling" | "garden" | "food";

export function classifyBin(binType: string): BinKind {
  const lower = binType.toLowerCase();
  if (/food|caddy|kitchen waste|compost/.test(lower)) return "food";
  if (/garden|brown/.test(lower)) return "garden";
  if (/recyc|blue|paper|card|glass/.test(lower)) return "recycling";
  return "general";
}

const SOURCES: Record<BinKind, string> = {
  general: generalBin,
  recycling: recyclingBin,
  garden: gardenBin,
  food: foodBin,
};

const WOBBLE = ["clay-wobble", "clay-wobble-slow", "clay-wobble-fast"];

export function BinIcon({
  binType,
  className = "h-32 w-32",
  wobble = false,
  index = 0,
}: {
  binType: string;
  className?: string;
  wobble?: boolean;
  index?: number;
}) {
  const kind = classifyBin(binType);
  return (
    <img
      src={SOURCES[kind]}
      alt={`${binType} bin`}
      className={`${className} object-contain select-none ${wobble ? WOBBLE[index % WOBBLE.length] : ""}`}
      draggable={false}
    />
  );
}
