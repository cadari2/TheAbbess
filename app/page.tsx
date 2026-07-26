import type { Metadata } from "next";
import InquisitionGame from "./InquisitionGame";

export const metadata: Metadata = {
  title: "The Holy Office — A Gothic Exploration",
  description:
    "Explore the Inquisition dungeons imagined in the late chapters of W. H. Ireland's The Abbess, Volume II.",
};

export default function Home() {
  return <InquisitionGame />;
}
