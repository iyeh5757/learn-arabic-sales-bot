import { Suspense } from "react";
import { AssistDesk } from "@/components/AssistDesk";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="page"><p>Loading assist…</p></div>}>
      <AssistDesk />
    </Suspense>
  );
}
