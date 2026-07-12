import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentProcessingPlayground } from "./ContentProcessingPlayground";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Content Processing Playground | Bright Studio",
};

export default function ContentProcessingPlaygroundPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ContentProcessingPlayground />;
}
