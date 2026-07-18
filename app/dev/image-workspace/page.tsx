import { notFound } from "next/navigation";

import { ImageWorkspacePlayground } from "./ImageWorkspacePlayground";

export default function ImageWorkspaceVerificationPage() {
  if (process.env.BRIGHT_STUDIO_DEV_FIXTURES !== "1") notFound();

  return <ImageWorkspacePlayground />;
}
